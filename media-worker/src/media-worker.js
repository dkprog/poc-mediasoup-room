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
  transports = new Map(),
  producers = new Map(),
  consumers = new Map()

let axiosIntance, app, httpServer, worker

main()

async function main() {
  checkWorkerUUID()

  axiosIntance = axios.create({
    baseURL: process.env.LOAD_BALANCER_BASE_URL,
    timeout: 1000,
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
  }, 10000)
}

async function pingLoadBalancer() {
  try {
    const cpuPercentage = await cpu.usage()
    await axiosIntance.put(`/worker/status`, {
      uuid: process.env.WORKER_UUID,
      cpuPercentage,
      rooms: [...rooms.keys()],
    })
  } catch (error) {
    console.error(`Could not ping the load-balancer:`, error.message)
  }
}
