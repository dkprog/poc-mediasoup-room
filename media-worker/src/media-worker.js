import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv-defaults'
import http from 'http'
import * as mediasoup from 'mediasoup'
import { MEDIA_CODECS, WORKER_SETTINGS } from './constants'
import logger from 'morgan'
import osu from 'node-os-utils'
import packageJson from '../package.json'

dotenv.config()

const transports = new Map(),
  producers = new Map(),
  consumers = new Map()

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
  app.use(logger('dev'))

  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(`${packageJson.name} listening HTTP in port ${PORT}`)
  })
}
