import express from 'express'
import dotenv from 'dotenv-defaults'
import socketIO from 'socket.io'
import http from 'http'

dotenv.config()

let app, httpServer, io

main()

function main() {
  startWebserver()
  startSignalingServer()
}

function startWebserver() {
  const { PORT } = process.env
  app = express()
  app.use(express.static('public'))
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

    socket.on('disconnect', () => {
      console.log('client disconnect', { socketId: socket.id })
    })
  })
}
