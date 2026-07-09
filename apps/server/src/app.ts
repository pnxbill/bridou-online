import cors from 'cors'
import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import { AbandonmentService } from './application/abandonment'
import { GameService } from './application/game-service'
import { PresenceTracker } from './application/presence'
import { Queue } from './application/queue'
import { CompositeGateway } from './infra/composite-gateway'
import { ConnectionRegistry } from './infra/connection-registry'
import { InMemoryGameRepository } from './infra/in-memory-game-repository'
import { InterceptingGateway } from './infra/intercepting-gateway'
import { SocketIoGateway, registerConnectionHandlers } from './infra/socket-io-gateway'
import { SseGateway } from './infra/sse-gateway'
import { createRoutes } from './http/routes'

export interface AppInstance {
  httpServer: http.Server
  service: GameService
  close(): Promise<void>
}

export interface AppOptions {
  /** Abandonment timings — overridden in tests to keep them fast. */
  abandonment?: { debounceMs?: number; graceMs?: number; botThinkMs?: number }
}

/**
 * Composition root: wires the engine, use-cases and transports together.
 * Events go out over BOTH socket.io and SSE while the transports coexist;
 * each client picks one (see apps/web NEXT_PUBLIC_REALTIME_TRANSPORT).
 */
export const createApp = (options: AppOptions = {}): AppInstance => {
  const app = express()
  app.use(express.json())
  app.use(cors())

  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })

  const games = new InMemoryGameRepository()
  const abandonment = new AbandonmentService({ games, ...options.abandonment })

  // Presence flows in from every transport; abandonment reacts to it
  const registry = new ConnectionRegistry()
  const presence = new PresenceTracker(abandonment)
  registerConnectionHandlers(io, registry, presence)
  const sse = new SseGateway(presence)

  // Events flow out through both transports, teed to the abandonment service
  // so it can act when a bot-controlled seat is prompted
  const gateway = new InterceptingGateway(
    new CompositeGateway([new SocketIoGateway(io, registry), sse]),
    (gameId, event) => abandonment.onDomainEvent(gameId, event),
  )

  const service = new GameService(games, new Queue(), gateway, abandonment)
  abandonment.bind({ gateway, actions: service })

  app.get('/api/games/:gameId/events', sse.handler())
  app.use(createRoutes(service))

  const close = async (): Promise<void> => {
    sse.close()
    io.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  return { httpServer, service, close }
}
