import express from 'express'
import bodyParser from 'body-parser'
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
}

function startWebserver() {
  const { PORT } = process.env
  app = express()

  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(logger('dev'))

  app.put('/worker/status', (req, res) => {
    if ('uuid' in req.body && 'url' in req.body) {
      workersStatus.set(req.body.uuid, { ...req.body, updatedAt: Date.now() })
      console.log(workersStatus)
      return res.status(200).json()
    } else {
      return res.status(400).json()
    }
  })

  // TODO: setup a timer to teardown unavaliable workers
  // TODO: create a middleware to easily access workerUrl from /room/:roomName

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

  app.post('/client/rooms/:roomName/peers', async (req, res) => {
    const { roomName } = req.params
    const { socketId } = req.body

    if (!socketId) {
      return res.status(400).json({ error: 'socketId not defined' })
    }

    const workerUrl = findWorkerUrlByRoomName(roomName)
    if (!workerUrl) {
      return res.status(503).json({ error: 'No worker found' })
    }

    const url = new URL(`/rooms/${roomName}/peers`, workerUrl).href
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

  app.delete('/client/rooms/:roomName/peers/:socketId', async (req, res) => {
    const { roomName, socketId } = req.params

    const workerUrl = findWorkerUrlByRoomName(roomName)
    if (!workerUrl) {
      return res.status(503).json({ error: 'No worker found' })
    }

    const url = new URL(`/rooms/${roomName}/peers/${socketId}`, workerUrl).href
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
  })

  app.post('/client/rooms/:roomName/transports', async (req, res) => {
    const { roomName } = req.params
    const { fromSocketId, direction, toSocketId } = req.body

    if (!fromSocketId) {
      return res.status(400).json({ error: 'fromSocketId not defined' })
    } else if (direction !== 'send' && direction !== 'recv') {
      return res.status(400).json({ error: 'invalid direction' })
    }

    const workerUrl = findWorkerUrlByRoomName(roomName)
    if (!workerUrl) {
      return res.status(503).json({ error: 'No worker found' })
    }

    const url = new URL(`/rooms/${roomName}/transports`, workerUrl).href
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

  app.put(
    '/client/rooms/:roomName/transports/:transportId',
    async (req, res) => {
      const { roomName, transportId } = req.params
      const { fromSocketId, dtlsParameters } = req.body

      if (!fromSocketId) {
        return res.status(400).json({ error: 'fromSocketId not defined' })
      } else if (!dtlsParameters) {
        return res.status(400).json({ error: 'dtlsParameters not defined' })
      }

      const workerUrl = findWorkerUrlByRoomName(roomName)
      if (!workerUrl) {
        res.status(503).json({ error: 'No worker found' })
      }

      const url = new URL(
        `/rooms/${roomName}/transports/${transportId}`,
        workerUrl
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

  app.post(
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

      const workerUrl = findWorkerUrlByRoomName(roomName)
      if (!workerUrl) {
        return res.status(503).json({ error: 'No worker found' })
      }

      const url = new URL(
        `/rooms/${roomName}/transports/${transportId}/producers`,
        workerUrl
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

  app.post(
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

      const workerUrl = findWorkerUrlByRoomName(roomName)
      if (!workerUrl) {
        return res.status(503).json({ error: 'No worker found' })
      }

      const url = new URL(
        `/rooms/${roomName}/transports/${transportId}/consumers`,
        workerUrl
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

  httpServer = http.Server(app)
  httpServer.listen(PORT, () => {
    console.log(`${packageJson.name} listening HTTP in port ${PORT}`)
  })
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
    .filter((workerStatus) => workerStatus.cpuPercentage <= 60.0)
    .sort((a, b) => a.cpuPercentage - b.cpuPercentage)[0]
  console.log(workerStatus)
  if (workerStatus) {
    url = workerStatus.url
  }
  return url
}
