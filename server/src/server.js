import express from 'express'
import dotenv from 'dotenv-defaults'
import socketIO from 'socket.io'
import http from 'http'
import * as mediasoup from 'mediasoup'
import { LISTEN_IPS, MEDIA_CODECS, WORKER_SETTINGS } from './constants'

dotenv.config()

const transports = new Map(),
  producers = new Map(),
  consumers = new Map()

let app, httpServer, io, worker, router

main()

async function main() {
  await startMediasoup()
  startWebserver()
  startSignalingServer()
}

async function startMediasoup() {
  worker = await mediasoup.createWorker(WORKER_SETTINGS)

  worker.on('died', () => {
    console.error('mediasoup worker died (this should never happen)')
    process.exit(1)
  })

  router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS })
}

function startWebserver() {
  const { PORT } = process.env
  app = express()
  app.use(express.static('public'))
  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(`Listening HTTP in port ${PORT}`)
  })
}

function startSignalingServer() {
  io = socketIO(httpServer, {
    serveClient: false,
    transports: ['websocket'],
    cors: {
      origin: '*',
    },
  })

  io.on('connect', (socket) => {
    console.log('client connect', { socketId: socket.id })

    socket.emit('welcome', {
      routerRtpCapabilities: router.rtpCapabilities,
    })

    socket.on('disconnecting', () => {
      if (socket.rooms.has('room')) {
        io.to('room').emit('peer-left', { socketId: socket.id })
      }
    })

    socket.on('disconnect', async () => {
      console.log('client disconnect', { socketId: socket.id })
      await closePeer(socket.id)
    })

    socket.on('create-transport', async ({ direction, toSocketId }, ack) => {
      const transport = await createWebRtcTransport({
        socketId: socket.id,
        direction,
        toSocketId,
      })
      transports.set(transport.id, transport)
      console.log('create-transport', {
        socketId: socket.id,
        direction,
        toSocketId,
        transportId: transport.id,
      })

      const { id, iceParameters, iceCandidates, dtlsParameters } = transport
      ack({
        transportOptions: { id, iceParameters, iceCandidates, dtlsParameters },
      })
    })

    socket.on(
      'connect-transport',
      async ({ transportId, dtlsParameters }, ack) => {
        console.log('connect-transport', {
          socketId: socket.id,
          transportId,
          dtlsParameters,
        })

        const transport = transports.get(transportId)

        if (!transport) {
          console.error('connect-transport: transport ID not found.', {
            socketId: socket.id,
            transportId,
          })
          ack({ error: `transport ID ${transportId} not found` })
          return
        }

        try {
          await transport.connect({ dtlsParameters })
        } catch (error) {
          console.error('error in connect-transport', {
            socketId: socket.id,
            transportId,
            dtlsParameters,
            error,
          })
          ack({ error })
          return
        }

        ack({})
      }
    )

    socket.on(
      'send-track',
      async ({ transportId, kind, rtpParameters, paused, appData }, ack) => {
        console.log('send-track', {
          socketId: socket.id,
          transportId,
          kind,
          rtpParameters,
          paused,
          appData,
        })

        const transport = transports.get(transportId)

        if (!transport) {
          console.error('connect-transport: transport ID not found.', {
            socketId: socket.id,
            transportId,
          })
          ack({ error: `transport ID ${transportId} not found` })
          return
        }

        let producer = await transport.produce({
          kind,
          rtpParameters,
          paused,
          appData: { ...appData, socketId: socket.id, transportId },
        })

        producer.on('transportclose', () => {
          console.log("producer's transport closed", {
            socketId: socket.id,
            producerId: producer.id,
          })
          closeProducer(producer)
        })

        if (producer.kind === 'audio') {
          // TODO: observe audio producer
        }

        producers.set(producer.id, producer)
        ack({ id: producer.id })
      }
    )

    socket.on('join', (ack) => {
      socket.join('room')
      ack({
        onlinePeers: Array.from(
          io.of('/').adapter.rooms.get('room').values()
        ).filter((socketId) => socketId !== socket.id),
      })
      socket.to('room').emit('peer-joined', { socketId: socket.id })
    })

    socket.on('leave', async (ack) => {
      socket.leave('room')
      ack()
      io.to('room').emit('peer-left', { socketId: socket.id })
      await closeRecvTransportsBySocketId(socket.id)
    })
  })
}

async function createWebRtcTransport({ socketId, direction, toSocketId }) {
  const transport = await router.createWebRtcTransport({
    listenIps: LISTEN_IPS,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800000,
    appData: { socketId, clientDirection: direction, toSocketId },
  })

  return transport
}

async function closePeer(socketId) {
  console.log('closing peer', { socketId })
  for (const [, transport] of transports) {
    if (
      transport.appData.socketId === socketId ||
      transport.appData.toSocketId === socketId
    ) {
      await closeTransport(transport)
    }
  }
}

async function closeRecvTransportsBySocketId(socketId) {
  for (const [, transport] of transports) {
    if (
      transport.appData.clientDirection === 'recv' &&
      (transport.appData.socketId === socketId ||
        transport.appData.toSocketId === socketId)
    ) {
      await closeTransport(transport)
    }
  }
}

async function closeTransport(transport) {
  try {
    console.log('closing transport', {
      transportId: transport.id,
      appData: transport.appData,
    })
    await transport.close()
    transports.delete(transport.id)
  } catch (error) {
    console.error(error)
  }
}

async function closeProducer(producer) {
  console.log('closing producer', {
    producerId: producer.id,
    appData: producer.appData,
  })

  try {
    await producer.close()
    producers.delete(producer.id)
  } catch (error) {
    console.error(error)
  }
}
