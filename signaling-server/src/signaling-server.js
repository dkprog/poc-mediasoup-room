import express from 'express'
import dotenv from 'dotenv-defaults'
import socketIO from 'socket.io'
import http from 'http'
import axios from 'axios'

dotenv.config()

let axiosIntance, app, httpServer, io

main()

function main() {
  axiosIntance = axios.create({
    baseURL: process.env.API_BASE_URL,
    timeout: 1000,
  })

  startWebserver()
  startSignalingServer()
}

function startWebserver() {
  const { PORT } = process.env
  app = express()
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

    socket.on('disconnecting', () => {
      const roomName = getRoomName()
      if (roomName && socket.rooms.has(roomName)) {
        io.to(roomName).emit('peer-left', { socketId: socket.id })
      }
    })

    socket.on('disconnect', async () => {
      console.log('client disconnect', { socketId: socket.id })
      // TODO: close peer
    })

    socket.on('create-transport', async ({ direction, toSocketId }, ack) => {
      const roomName = getRoomName()
      if (!roomName) {
        return
      }

      console.log('create-transport', {
        socketId: socket.id,
        direction,
        toSocketId,
        roomName,
      })

      let response, transportOptions

      try {
        response = await axiosIntance.post(`/rooms/${roomName}/transports`, {
          socketId: socket.id,
          direction,
          toSocketId,
        })
        transportOptions = response.data.transportOptions
      } catch (error) {
        console.error(
          `Could not create transport for ${socket.id}:`,
          error.message
        )
        ack({ error: `Could not create transport` })
        return
      }

      ack({ transportOptions })
    })

    socket.on(
      'connect-transport',
      async ({ transportId, dtlsParameters }, ack) => {
        console.log('connect-transport', {
          socketId: socket.id,
          transportId,
          dtlsParameters,
        })
        // TODO: connect transport
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
        // TODO: create producer in the transport
      }
    )

    socket.on(
      'recv-track',
      async ({ toSocketId, mediaTag, rtpCapabilities, transportId }, ack) => {
        console.log('recv-track', {
          socketId: socket.id,
          toSocketId,
          mediaTag,
          rtpCapabilities,
          transportId,
        })
        // TODO: create consumer in the transport
      }
    )

    socket.on('join', async ({ roomName }, ack) => {
      if (!roomName) {
        return
      }

      let response, routerRtpCapabilities

      try {
        response = await axiosIntance.put(`/rooms/${roomName}`)
        routerRtpCapabilities = response.data.routerRtpCapabilities
      } catch (error) {
        console.error(error.message)
        return
      }

      console.log('join', { socketId: socket.id, roomName })
      socket.join(roomName)
      ack({
        onlinePeers: Array.from(
          io.of('/').adapter.rooms.get(roomName).values()
        ).filter((socketId) => socketId !== socket.id),
        routerRtpCapabilities,
      })
      socket.to(roomName).emit('peer-joined', { socketId: socket.id })
    })

    socket.on('leave', async (ack) => {
      const roomName = getRoomName()
      if (!roomName) {
        return
      }
      console.log('leave', { socketId: socket.id, roomName })

      socket.leave(roomName)
      ack()
      io.to(roomName).emit('peer-left', { socketId: socket.id })
      // TODO: close recv transports
    })

    function getRoomName() {
      return Array.from(socket.rooms).find((roomName) => roomName !== socket.id)
    }
  })
}