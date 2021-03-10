import express from 'express'
import dotenv from 'dotenv-defaults'
import socketIO from 'socket.io'
import http from 'http'

dotenv.config()

let app, httpServer, io

main()

async function main() {
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

    // TODO: emit 'welcome'

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
      console.log('create-transport', {
        socketId: socket.id,
        direction,
        toSocketId,
      })
      // TODO: create transport
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

    socket.on('join', ({ roomName }, ack) => {
      if (!roomName) {
        return
      }
      console.log('join', { socketId: socket.id, roomName })
      socket.join(roomName)
      // TODO: send router's rtpCapabilities
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
