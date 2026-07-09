import cors from 'cors'
import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import { GameService } from './application/game-service'
import { Queue } from './application/queue'
import { CompositeGateway } from './infra/composite-gateway'
import { ConnectionRegistry } from './infra/connection-registry'
import { InMemoryGameRepository } from './infra/in-memory-game-repository'
import { SocketIoGateway, registerConnectionHandlers } from './infra/socket-io-gateway'
import { SseGateway } from './infra/sse-gateway'
import { createRoutes } from './http/routes'

export interface AppInstance {
  httpServer: http.Server
  service: GameService
  close(): Promise<void>
}

/**
 * Composition root: wires the engine, use-cases and transports together.
 * Events go out over BOTH socket.io and SSE while the transports coexist;
 * each client picks one (see apps/web NEXT_PUBLIC_REALTIME_TRANSPORT).
 */
export const createApp = (): AppInstance => {
  const app = express()
  app.use(express.json())
  app.use(cors())

  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })

  const registry = new ConnectionRegistry()
  registerConnectionHandlers(io, registry)
  const sse = new SseGateway()
  const gateway = new CompositeGateway([new SocketIoGateway(io, registry), sse])

  const service = new GameService(new InMemoryGameRepository(), new Queue(), gateway)

  app.get('/api/games/:gameId/events', sse.handler())
  app.use(createRoutes(service))

  const close = async (): Promise<void> => {
    sse.close()
    io.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  return { httpServer, service, close }
}
