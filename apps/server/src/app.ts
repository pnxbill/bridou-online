import cors from 'cors'
import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import { GameService } from './application/game-service'
import { Queue } from './application/queue'
import { ConnectionRegistry } from './infra/connection-registry'
import { InMemoryGameRepository } from './infra/in-memory-game-repository'
import { SocketIoGateway, registerConnectionHandlers } from './infra/socket-io-gateway'
import { createRoutes } from './http/routes'

export interface AppInstance {
  httpServer: http.Server
  io: Server
  service: GameService
}

/** Composition root: wires the engine, use-cases and transport together. */
export const createApp = (): AppInstance => {
  const app = express()
  app.use(express.json())
  app.use(cors())

  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })

  const registry = new ConnectionRegistry()
  registerConnectionHandlers(io, registry)

  const service = new GameService(
    new InMemoryGameRepository(),
    new Queue(),
    new SocketIoGateway(io, registry),
  )

  app.use(createRoutes(service))

  return { httpServer, io, service }
}
