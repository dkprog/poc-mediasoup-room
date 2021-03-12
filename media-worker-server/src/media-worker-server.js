import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv-defaults'
import http from 'http'
import * as mediasoup from 'mediasoup'
import { MEDIA_CODECS, WORKER_SETTINGS } from './constants'
import logger from 'morgan'

dotenv.config()

const transports = new Map(),
  producers = new Map(),
  consumers = new Map()

let app, httpServer, worker, router

main()

async function main() {
  await startMediasoup()
  startWebserver()

  setInterval(() => {
    console.log(
      'consumers:',
      [...consumers.values()].map((c) => [c.id, c.appData.clientDirection])
    )
  }, 1000)
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

  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(logger('dev'))

  app.get('/rooms/:roomName', (req, res) => {
    return res.json({ routerRtpCapabilities: router.rtpCapabilities })
  })

  app.put('/rooms/:roomName', (req, res) => {
    return res.sendStatus(200)
  })

  app.delete('/rooms/:roomName', async (req, res) => {
    const { socketId } = req.body
    await closePeer(socketId)
    return res.sendStatus(200)
  })

  app.post('/rooms/:roomName/transports', async (req, res) => {
    const { socketId, direction, toSocketId } = req.body

    const transport = await createWebRtcTransport({
      socketId,
      direction,
      toSocketId,
    })
    transports.set(transport.id, transport)
    const { id, iceParameters, iceCandidates, dtlsParameters } = transport
    return res.json({
      transportOptions: { id, iceParameters, iceCandidates, dtlsParameters },
    })
  })

  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(`Listening HTTP in port ${PORT}`)
  })

  app.delete('/rooms/:roomName/transports/:transportId', async (req, res) => {
    const { socketId } = req.body
    const { transportId } = req.params

    const transport = transports.get(transportId)

    if (!transport) {
      return res.sendStatus(404)
    } else if (transport.appData.socketId !== socketId) {
      return res.sendStatus(403)
    }

    await transport.close()
    transports.delete(transport.id)
    return res.sendStatus(200)
  })

  app.put('/rooms/:roomName/transports/:transportId', async (req, res) => {
    const { socketId, dtlsParameters } = req.body
    const { transportId } = req.params

    const transport = transports.get(transportId)

    if (!transport) {
      return res.sendStatus(404)
    } else if (transport.appData.socketId !== socketId) {
      return res.sendStatus(403)
    }

    try {
      await transport.connect({ dtlsParameters })
    } catch (error) {
      console.error('error in connect-transport', {
        socketId,
        transportId,
        dtlsParameters,
        error,
      })
      return res.sendStatus(500)
    }

    return res.sendStatus(200)
  })

  app.post(
    '/rooms/:roomName/transports/:transportId/producers',
    async (req, res) => {
      const { socketId, kind, rtpParameters, paused, appData } = req.body
      const { transportId } = req.params

      const transport = transports.get(transportId)

      if (!transport) {
        return res.sendStatus(404)
      } else if (transport.appData.socketId !== socketId) {
        return res.sendStatus(403)
      }

      let producer = await transport.produce({
        kind,
        rtpParameters,
        paused,
        appData: { ...appData, socketId, transportId },
      })

      producer.on('transportclose', () => {
        console.log("producer's transport closed", {
          socketId,
          producerId: producer.id,
        })
        closeProducer(producer)
      })

      if (producer.kind === 'audio') {
        // TODO: observe audio producer
      }

      producers.set(producer.id, producer)
      return res.json({ producerId: producer.id })
    }
  )

  app.post(
    `/rooms/:roomName/transports/:transportId/consumers`,
    async (req, res) => {
      const { socketId, toSocketId, mediaTag, rtpCapabilities } = req.body
      const { transportId } = req.params
      const producer = Array.from(producers.values()).find(
        (p) =>
          p.appData.mediaTag === mediaTag && p.appData.socketId === toSocketId
      )

      if (!producer) {
        console.error(
          `service-side producer for ${toSocketId}:${mediaTag} not found`
        )
        return res.sendStatus(400)
      }

      let transport = transports.get(transportId)

      if (!transport) {
        console.error(`service-side recv transport #${transportId} not found`)
        return res.sendStatus(400)
      }

      if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
        console.error(`client cannot consume ${toSocketId}:${mediaTag}`)
        return res.sendStatus(500)
      }

      let consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: false,
        appData: { socketId, toSocketId },
      })

      consumer.on('transportclose', async () => {
        console.log(`consumer's transport closed`, consumer.id)
        await closeConsumer(consumer)
      })

      consumer.on('producerclose', async () => {
        console.log(`consumer's producer closed`, consumer.id)
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
}

async function createWebRtcTransport({ socketId, direction, toSocketId }) {
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

async function closeConsumer(consumer) {
  console.log('closing consumer', {
    consumerId: consumer.id,
    appData: consumer.appData,
  })

  try {
    await consumer.close()
    consumers.delete(consumer.id)
  } catch (error) {
    console.error(error)
  }
}
