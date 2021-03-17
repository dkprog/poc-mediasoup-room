import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv-defaults'
import http from 'http'
import axios from 'axios'
import * as mediasoup from 'mediasoup'
import { MEDIA_CODECS, WORKER_SETTINGS } from './constants'
import logger from 'morgan'
import { cpu } from 'node-os-utils'
import packageJson from '../package.json'

dotenv.config()

const rooms = new Map(),
  peersRooms = new Map(),
  transports = new Map(),
  producers = new Map(),
  consumers = new Map()

let axiosInstance, app, httpServer, worker

main()

async function main() {
  checkWorkerUUID()

  axiosInstance = axios.create({
    baseURL: process.env.LOAD_BALANCER_BASE_URL,
    timeout: 5000,
  })

  await startMediasoup()
  startWebserver()
  startPinger()
}

function checkWorkerUUID() {
  if (!process.env.WORKER_UUID) {
    console.error('Error: WORKER_UUID not defined.')
    process.exit(1)
  }
}

async function startMediasoup() {
  worker = await mediasoup.createWorker(WORKER_SETTINGS)

  worker.on('died', () => {
    console.error('mediasoup worker died (this should never happen)')
    process.exit(1)
  })
}

function startWebserver() {
  const { PORT } = process.env
  app = express()

  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(logger('dev'))

  app.post('/rooms', async (req, res) => {
    const { roomName } = req.body

    if (!roomName) {
      return res.status(400).json({ error: 'roomName not defined' })
    }

    let router
    if (rooms.has(roomName)) {
      router = rooms.get(roomName)
    } else {
      router = await worker.createRouter({
        mediaCodecs: MEDIA_CODECS,
        appData: { roomName },
      })
      router.observer.on('close', () => {
        rooms.delete(router.appData.roomName)
      })
      rooms.set(roomName, router)
    }

    const mediaWorkerStatus = await getMediaWorkerStatus()

    return res.json({
      roomName,
      routerRtpCapabilities: router.rtpCapabilities,
      mediaWorkerStatus,
    })
  })

  app.post('/rooms/:roomName/peers', (req, res) => {
    const { roomName } = req.params
    const { socketId } = req.body

    if (!socketId) {
      return res.status(400).json({ error: 'socketId not defined' })
    }

    peersRooms.set(socketId, roomName)

    return res.json({ roomName, socketId })
  })

  app.delete('/rooms/:roomName/peers/:socketId', async (req, res) => {
    const { roomName, socketId } = req.params
    await closePeer(socketId)
    return res.json({ roomName, socketId })
  })

  app.post('/rooms/:roomName/transports', async (req, res) => {
    const { roomName } = req.params
    const { fromSocketId, direction, toSocketId } = req.body

    if (!fromSocketId) {
      return res.status(400).json({ error: 'fromSocketId not defined' })
    } else if (direction !== 'send' && direction !== 'recv') {
      return res.status(400).json({ error: 'invalid direction' })
    }

    let transport

    try {
      transport = await createWebRtcTransport({
        roomName,
        fromSocketId,
        direction,
        toSocketId,
      })
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }

    transports.set(transport.id, transport)
    const { id, iceParameters, iceCandidates, dtlsParameters } = transport
    return res.json({
      transportOptions: { id, iceParameters, iceCandidates, dtlsParameters },
    })
  })

  app.put('/rooms/:roomName/transports/:transportId', async (req, res) => {
    const { roomName, transportId } = req.params
    const { fromSocketId, dtlsParameters } = req.body

    if (!fromSocketId) {
      return res.status(400).json({ error: 'fromSocketId not defined' })
    } else if (!dtlsParameters) {
      return res.status(400).json({ error: 'dtlsParameters not defined' })
    }

    const transport = transports.get(transportId)
    if (!transport || transport.appData.roomName !== roomName) {
      return res.status(404).json({ error: 'Transport not found' })
    } else if (transport.appData.fromSocketId !== fromSocketId) {
      return res.status(404).json({ error: 'Transport is forbidden' })
    }

    try {
      await transport.connect({ dtlsParameters })
    } catch (error) {
      console.error('error in connect-transport', {
        fromSocketId,
        transportId,
        dtlsParameters,
        error,
      })
      return res.status(500).json({ error: 'Could not connect transport' })
    }

    return res.json()
  })

  app.post(
    '/rooms/:roomName/transports/:transportId/producers',
    async (req, res) => {
      const { roomName, transportId } = req.params
      let { socketId, kind, rtpParameters, appData } = req.body

      if (!socketId) {
        return res.status(400).json({ error: 'socketId not defined' })
      } else if (!kind) {
        return res.status(400).json({ error: 'kind not defined' })
      } else if (!rtpParameters) {
        return res.status(400).json({ error: 'rtpParameters not defined' })
      }

      if (!appData) {
        appData = {}
      }

      const transport = transports.get(transportId)
      if (!transport || transport.appData.roomName !== roomName) {
        return res.status(404).json({ error: 'Transport not found' })
      } else if (transport.appData.fromSocketId !== socketId) {
        return res.status(404).json({ error: 'Transport is forbidden' })
      }

      let producer = await transport.produce({
        kind,
        rtpParameters,
        paused: false,
        appData: { ...appData, socketId, transportId, roomName },
      })

      producer.on('transportclose', () => {
        closeProducer(producer)
      })

      producers.set(producer.id, producer)
      return res.json({ producerId: producer.id })
    }
  )

  app.post(
    `/rooms/:roomName/transports/:transportId/consumers`,
    async (req, res) => {
      const { roomName, transportId } = req.params
      const { fromSocketId, toSocketId, rtpCapabilities } = req.body

      if (!fromSocketId) {
        return res.status(400).json({ error: 'fromSocketId not defined' })
      } else if (!toSocketId) {
        return res.status(400).json({ error: 'toSocketId not defined' })
      } else if (!rtpCapabilities) {
        return res.status(400).json({ error: 'rtpCapabilities not defined' })
      }

      const producer = [...producers.values()].find(
        (producer) =>
          producer.appData.socketId === toSocketId &&
          producer.appData.roomName === roomName
      )

      if (!producer) {
        return res.status(404).json({ error: 'Producer not found' })
      }

      const router = rooms.get(roomName)
      if (!router) {
        return res.status(500).json({ error: 'Invalid router' })
      }

      if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
        return res
          .status(500)
          .json({ error: 'Router cannot consume from producer' })
      }

      const transport = transports.get(transportId)

      if (!transport) {
        return res.status(404).json({ error: 'Transport not found' })
      }

      let consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: false,
        appData: { fromSocketId, toSocketId, roomName },
      })

      consumer.on('transportclose', async () => {
        await closeConsumer(consumer)
      })

      consumer.on('producerclose', async () => {
        await closeConsumer(consumer)
      })

      consumers.set(consumer.id, consumer)

      return res.json({
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      })
    }
  )

  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(
      `${packageJson.name} ${process.env.WORKER_UUID} listening HTTP in port ${PORT}`
    )
  })
}

function startPinger() {
  pingLoadBalancer()
  setInterval(() => {
    pingLoadBalancer()
  }, 3000)
}

async function pingLoadBalancer() {
  try {
    const mediaWorkerStatus = await getMediaWorkerStatus()
    await axiosInstance.put(`/worker/status`, mediaWorkerStatus)
  } catch (error) {
    console.error(`Could not ping the load-balancer:`, error.message)
  }
}

async function getMediaWorkerStatus() {
  const cpuPercentage = await cpu.usage()

  return {
    uuid: process.env.WORKER_UUID,
    url: process.env.SELF_BASE_URL,
    cpuPercentage,
    rooms: [...rooms.keys()],
    peers: [...peersRooms.entries()].reduce((acc, [socketId, roomName]) => {
      acc[socketId] = roomName
      return acc
    }, {}),
    transports: [...transports.keys()],
    producers: [...producers.keys()],
    consumers: [...consumers.keys()],
  }
}

async function createWebRtcTransport({
  roomName,
  fromSocketId,
  direction,
  toSocketId,
}) {
  const router = rooms.get(roomName)
  if (!router) {
    throw new Error('Room not found')
  }

  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: process.env.LISTEN_IP,
        announcedIp: process.env.ANNOUNCED_IP || null,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800000,
    appData: { fromSocketId, clientDirection: direction, toSocketId, roomName },
  })

  return transport
}

async function closePeer(socketId) {
  for (const [, transport] of transports) {
    if (
      transport.appData.fromSocketId === socketId ||
      transport.appData.toSocketId === socketId
    ) {
      await closeTransport(transport)
    }
  }

  if (peersRooms.has(socketId)) {
    const roomName = peersRooms.get(socketId)
    peersRooms.delete(socketId)

    const totalRemainingPeers = [peersRooms.values()].filter(
      (name) => name === roomName
    ).length

    const isTheLastPeer = totalRemainingPeers === 0 && rooms.has(roomName)

    if (isTheLastPeer) {
      const router = rooms.get(roomName)
      router.close()
    }
  }
}

async function closeTransport(transport) {
  try {
    await transport.close()
    transports.delete(transport.id)
  } catch (error) {
    console.error(error)
  }
}

async function closeProducer(producer) {
  try {
    await producer.close()
    producers.delete(producer.id)
  } catch (error) {
    console.error(error)
  }
}

async function closeConsumer(consumer) {
  try {
    await consumer.close()
    consumers.delete(consumer.id)
  } catch (error) {
    console.error(error)
  }
}
