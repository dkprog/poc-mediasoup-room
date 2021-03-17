import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv-defaults'
import http from 'http'
import logger from 'morgan'
import packageJson from '../package.json'

dotenv.config()

let app, httpServer

main()

async function main() {
  startWebserver()
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
