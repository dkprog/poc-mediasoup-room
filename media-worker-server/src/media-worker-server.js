import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv-defaults'
import http from 'http'
import * as mediasoup from 'mediasoup'
import { MEDIA_CODECS, WORKER_SETTINGS } from './constants'

dotenv.config()

const transports = new Map()

let app, httpServer, worker, router

main()

async function main() {
  await startMediasoup()
  startWebserver()
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

  app.put('/rooms/:roomName', (req, res) => {
    return res.json({ routerRtpCapabilities: router.rtpCapabilities })
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
