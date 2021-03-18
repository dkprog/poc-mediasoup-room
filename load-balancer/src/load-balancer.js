import express from 'express'
import dotenv from 'dotenv-defaults'
import http from 'http'
import logger from 'morgan'
import axios from 'axios'
import packageJson from '../package.json'

dotenv.config()

const workersStatus = new Map()

let axiosInstance, app, httpServer

main()

async function main() {
  axiosInstance = axios.create({
    timeout: 5000,
  })

  startWebserver()
  startWorkerMonitor()
}

function startWebserver() {
  const { PORT } = process.env
  app = express()
  const roomRouter = express.Router()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(logger('dev'))

  app.put('/worker/status', (req, res) => {
    if ('uuid' in req.body && 'url' in req.body) {
      workersStatus.set(req.body.uuid, { ...req.body, updatedAt: Date.now() })
      return res.status(200).json()
    } else {
      return res.status(400).json()
    }
  })

  app.post('/client/rooms', async (req, res) => {
    const { roomName } = req.body

    if (!roomName) {
      return res.status(400).json({ error: 'roomName not defined' })
    }

    let workerUrl = findWorkerUrlByRoomName(roomName)
    if (!workerUrl) {
      workerUrl = findNextAvailableWorkerUrl(roomName)
    }

    if (!workerUrl) {
      return res.status(503).json({ error: 'No worker found' })
    }

    const url = new URL('/rooms', workerUrl).href
    try {
      const response = await axiosInstance.post(url, { roomName })
      const { mediaWorkerStatus, ...otherFields } = response.data
      workersStatus.set(mediaWorkerStatus.uuid, mediaWorkerStatus)
      return res.json(otherFields)
    } catch (error) {
      console.error(
        'could not create room',
        error.message,
        error?.response?.data
      )
      return res.json(502).json({ error: 'could not create room' })
    }
  })

  roomRouter.use('/client/rooms/:roomName', async (req, res, next) => {
    const { roomName } = req.params
    const workerUrl = findWorkerUrlByRoomName(roomName)
    if (!workerUrl) {
      return res.status(503).json({ error: 'No worker found' })
    }
    req.workerUrl = workerUrl
    next()
  })

  roomRouter.post('/client/rooms/:roomName/peers', async (req, res) => {
    const { roomName } = req.params
    const { socketId } = req.body

    if (!socketId) {
      return res.status(400).json({ error: 'socketId not defined' })
    }

    const url = new URL(`/rooms/${roomName}/peers`, req.workerUrl).href
    try {
      const response = await axiosInstance.post(url, { socketId })
      return res.json(response.data)
    } catch (error) {
      console.error(
        'could not join peer into the room',
        error.message,
        error?.response?.data
      )
      return res
        .status(502)
        .json({ error: 'could not join peer into the room' })
    }
  })

  roomRouter.delete(
    '/client/rooms/:roomName/peers/:socketId',
    async (req, res) => {
      const { roomName, socketId } = req.params

      const url = new URL(`/rooms/${roomName}/peers/${socketId}`, req.workerUrl)
        .href
      try {
        const response = await axiosInstance.delete(url)
        return res.json(response.data)
      } catch (error) {
        console.error(
          'could not leave peer out of the room',
          error.message,
          error?.response?.data
        )
        return res
          .json(502)
          .json({ error: 'could not leave peer out of the room' })
      }
    }
  )

  roomRouter.post('/client/rooms/:roomName/transports', async (req, res) => {
    const { roomName } = req.params
    const { fromSocketId, direction, toSocketId } = req.body

    if (!fromSocketId) {
      return res.status(400).json({ error: 'fromSocketId not defined' })
    } else if (direction !== 'send' && direction !== 'recv') {
      return res.status(400).json({ error: 'invalid direction' })
    }

    const url = new URL(`/rooms/${roomName}/transports`, req.workerUrl).href
    try {
      const response = await axiosInstance.post(url, {
        fromSocketId,
        direction,
        toSocketId,
      })
      return res.json(response.data)
    } catch (error) {
      console.error(
        'could not create transport',
        error.message,
        error?.response?.data
      )
      return res.status(502).json({ error: 'could not create transport' })
    }
  })

  roomRouter.put(
    '/client/rooms/:roomName/transports/:transportId',
    async (req, res) => {
      const { roomName, transportId } = req.params
      const { fromSocketId, dtlsParameters } = req.body

      if (!fromSocketId) {
        return res.status(400).json({ error: 'fromSocketId not defined' })
      } else if (!dtlsParameters) {
        return res.status(400).json({ error: 'dtlsParameters not defined' })
      }

      const url = new URL(
        `/rooms/${roomName}/transports/${transportId}`,
        req.workerUrl
      ).href
      try {
        const response = await axiosInstance.put(url, {
          fromSocketId,
          dtlsParameters,
        })
        return res.json(response.data)
      } catch (error) {
        console.error(
          'could not update transport',
          error.message,
          error?.response?.data
        )
        return res.status(502).json({ error: 'could not update transport' })
      }
    }
  )

  roomRouter.post(
    '/client/rooms/:roomName/transports/:transportId/producers',
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

      const url = new URL(
        `/rooms/${roomName}/transports/${transportId}/producers`,
        req.workerUrl
      ).href
      try {
        const response = await axiosInstance.post(url, {
          socketId,
          kind,
          rtpParameters,
          appData,
        })
        return res.json(response.data)
      } catch (error) {
        console.error(
          'could not create producer',
          error.message,
          error?.response?.data
        )
        return res.status(502).json({ error: 'could not create producer' })
      }
    }
  )

  roomRouter.post(
    `/client/rooms/:roomName/transports/:transportId/consumers`,
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

      const url = new URL(
        `/rooms/${roomName}/transports/${transportId}/consumers`,
        req.workerUrl
      ).href
      try {
        const response = await axiosInstance.post(url, {
          fromSocketId,
          toSocketId,
          rtpCapabilities,
        })
        return res.json(response.data)
      } catch (error) {
        console.error(
          'could not create consumer',
          error.message,
          error?.response?.data
        )
        return res.status(502).json({ error: 'could not create consumer' })
      }
    }
  )

  app.use('/', roomRouter)

  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(`${packageJson.name} listening HTTP in port ${PORT}`)
  })
}

function startWorkerMonitor() {
  const intervalMilliseconds =
    parseInt(process.env.WORKER_MONITOR_INTERVAL_SECS) * 1000

  setInterval(() => {
    const dateTimeNow = new Date().getTime()

    Array.from(workersStatus.values()).forEach((workerStatus) => {
      const dateTimeDiffSecs = Math.floor(
        (dateTimeNow - workerStatus.updatedAt) / 1000
      )
      if (dateTimeDiffSecs > parseInt(process.env.MAX_WORKER_TIMEOUT_SECS)) {
        // TODO: shutdown the machine
        workersStatus.delete(workerStatus.uuid)
      }
    })

    console.info(workersStatus)
  }, intervalMilliseconds)
}

function findWorkerUrlByRoomName(roomName) {
  let url
  const workerStatus = [...workersStatus.values()].find((worker) =>
    worker?.rooms?.find((name) => name === roomName)
  )
  if (workerStatus) {
    url = workerStatus.url
  }
  return url
}

function findNextAvailableWorkerUrl() {
  let url
  const workerStatus = [...workersStatus.values()]
    .filter(
      (workerStatus) =>
        workerStatus.cpuPercentage <=
        parseFloat(process.env.MAX_WORKER_CPU_THRESHOLD_VALUE)
    )
    .sort(
      (a, b) =>
        a.cpuPercentage - b.cpuPercentage ||
        a.transports.length - b.transports.length // TODO: invert it in order to full a worker
    )[0]
  if (workerStatus) {
    url = workerStatus.url
  }
  // TODO: create a new machine if no worker is found
  return url
}
