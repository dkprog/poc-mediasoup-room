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

    socket.on('welcome', async ({ roomName }, ack) => {
      console.log('welcome', { socketId: socket.id, roomName })

      let response, routerRtpCapabilities

      try {
        response = await axiosIntance.get(`/rooms/${roomName}`)
        routerRtpCapabilities = response.data.routerRtpCapabilities
      } catch (error) {
        console.error(error.message)
        return
      }

      ack({ routerRtpCapabilities })
    })

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

    socket.on(
      'create-transport',
      async ({ direction, toSocketId, roomName }, ack) => {
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
      }
    )

    socket.on(
      'connect-transport',
      async ({ transportId, dtlsParameters, roomName }, ack) => {
        console.log('connect-transport', {
          socketId: socket.id,
          transportId,
          dtlsParameters,
          roomName,
        })

        try {
          await axiosIntance.put(
            `/rooms/${roomName}/transports/${transportId}`,
            {
              socketId: socket.id,
              dtlsParameters,
            }
          )
        } catch (error) {
          console.error(
            `Could not connect transport #${transportId} for ${socket.id}:`,
            error.message
          )
          ack({ error: `Could not connect transport` })
          return
        }

        ack({})
      }
    )

    socket.on(
      'send-track',
      async (
        { transportId, kind, rtpParameters, paused, appData, roomName },
        ack
      ) => {
        console.log('send-track', {
          socketId: socket.id,
          transportId,
          kind,
          rtpParameters,
          paused,
          appData,
          roomName,
        })

        let response, producerId
        try {
          response = await axiosIntance.post(
            `/rooms/${roomName}/transports/${transportId}/producers`,
            {
              socketId: socket.id,
              kind,
              rtpParameters,
              paused,
              appData,
            }
          )
          producerId = response.data.producerId
        } catch (error) {
          console.error(
            `Could not send track to the transport #${transportId} for ${socket.id}:`,
            error.message
          )
          ack({ error: `Could not send track` })
          return
        }

        ack({ id: producerId })
      }
    )

    socket.on(
      'recv-track',
      async ({ toSocketId, mediaTag, rtpCapabilities, transportId }, ack) => {
        const roomName = getRoomName()
        if (!roomName) {
          return
        }

        console.log('recv-track', {
          socketId: socket.id,
          toSocketId,
          mediaTag,
          rtpCapabilities,
          transportId,
          roomName,
        })

        let response

        try {
          response = await axiosIntance.post(
            `/rooms/${roomName}/transports/${transportId}/consumers`,
            {
              socketId: socket.id,
              toSocketId,
              mediaTag,
              rtpCapabilities,
            }
          )
        } catch (error) {
          console.error(
            `Could not create a consumer for ${socket.id}:${toSocketId}:`,
            error.message
          )
          return ack({ error: 'Could not create a consumer' })
        }

        ack({ ...response.data })
      }
    )

    socket.on('close-transport', async ({ transportId, roomName }, ack) => {
      console.log('close-transport', {
        socketId: socket.id,
        transportId,
        roomName,
      })

      try {
        await axiosIntance.delete(
          `/rooms/${roomName}/transports/${transportId}`,
          { data: { socketId: socket.id } }
        )
      } catch (error) {
        console.error(
          `Could not delete transport #${transportId} for ${socket.id}:`,
          error.message
        )
        ack({ error: `Could not delete transport` })
        return
      }

      ack({})
    })

    socket.on('join', async ({ roomName }, ack) => {
      if (!roomName) {
        return
      }

      try {
        await axiosIntance.put(`/rooms/${roomName}`)
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
