import express from 'express'
import dotenv from 'dotenv-defaults'
import http from 'http'
import * as mediasoup from 'mediasoup'
import { MEDIA_CODECS, WORKER_SETTINGS } from './constants'

dotenv.config()

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

  app.put('/rooms/:roomName', (req, res) => {
    return res.json({ routerRtpCapabilities: router.rtpCapabilities })
  })

  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(`Listening HTTP in port ${PORT}`)
  })
}
