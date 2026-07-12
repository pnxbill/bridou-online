import cors from 'cors'
import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import { AbandonmentService } from './application/abandonment'
import { GameEviction } from './application/game-eviction'
import { GameHistoryRecorder } from './application/game-history'
import { GameService } from './application/game-service'
import { LobbyRegistry } from './application/lobby'
import { PresenceTracker } from './application/presence'
import type { GameHistoryRepository, PlayerRepository } from './application/ports'
import { createDb } from './db/client'
import { CompositeGateway } from './infra/composite-gateway'
import { ConnectionRegistry } from './infra/connection-registry'
import { InMemoryGameRepository } from './infra/in-memory-game-repository'
import {
  InMemoryGameHistoryRepository,
  InMemoryPlayerRepository,
} from './infra/in-memory-history'
import { InterceptingGateway } from './infra/intercepting-gateway'
import {
  PostgresGameHistoryRepository,
  PostgresPlayerRepository,
} from './infra/postgres-history'
import { SocketIoGateway, registerConnectionHandlers } from './infra/socket-io-gateway'
import { SseGateway } from './infra/sse-gateway'
import { registerVoiceHandlers } from './infra/voice-gateway'
import { createRoutes } from './http/routes'

export interface AppInstance {
  httpServer: http.Server
  service: GameService
  history: GameHistoryRepository
  close(): Promise<void>
}

export interface AppOptions {
  /** Abandonment timings — overridden in tests to keep them fast. */
  abandonment?: { debounceMs?: number; graceMs?: number; botThinkMs?: number }
  /** Override persistence (tests inject in-memory repos). */
  history?: GameHistoryRepository
  players?: PlayerRepository
  /** When set (or via DATABASE_URL), use Postgres instead of in-memory history. */
  databaseUrl?: string
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
  const eviction = new GameEviction({ games })

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL
  let closeDb: (() => Promise<void>) | undefined
  let historyRepo: GameHistoryRepository
  let playerRepo: PlayerRepository

  if (options.history && options.players) {
    historyRepo = options.history
    playerRepo = options.players
  } else if (databaseUrl) {
    const { db, client } = createDb(databaseUrl)
    historyRepo = new PostgresGameHistoryRepository(db)
    playerRepo = new PostgresPlayerRepository(db)
    closeDb = async () => {
      await client.end({ timeout: 5 })
    }
  } else {
    historyRepo = new InMemoryGameHistoryRepository()
    playerRepo = new InMemoryPlayerRepository()
  }

  const historyRecorder = new GameHistoryRecorder(historyRepo, playerRepo)

  // Presence flows in from every transport; abandonment reacts to it
  const registry = new ConnectionRegistry()
  const presence = new PresenceTracker(abandonment)
  registerConnectionHandlers(io, registry, presence)
  const sse = new SseGateway(presence)

  // Voice chat: browsers exchange WebRTC signaling through the /voice
  // namespace; the audio itself flows peer-to-peer and never touches us
  const voiceRooms = registerVoiceHandlers(io)

  // Events flow out through both transports, teed to abandonment, eviction,
  // and durable history (append-only event log + finished-game rows)
  const gateway = new InterceptingGateway(
    new CompositeGateway([new SocketIoGateway(io, registry), sse]),
    (gameId, event) => {
      abandonment.onDomainEvent(gameId, event)
      eviction.onDomainEvent(gameId, event)
      historyRecorder.onDomainEvent(gameId, event)
    },
  )

  const service = new GameService(games, new LobbyRegistry(), gateway, abandonment, {
    onGameStarted: (game) => {
      historyRecorder.recordGameStarted({
        gameId: game.id,
        leaderId: game.leaderId,
        roster: game.players,
      })
    },
  })
  abandonment.bind({ gateway, actions: service })

  app.get('/api/games/:gameId/events', sse.handler())
  app.get('/api/games/:gameId/voice', (req, res) => {
    res.json({ participants: voiceRooms.rosterOf(req.params.gameId) })
  })
  app.use(createRoutes(service))

  const close = async (): Promise<void> => {
    sse.close()
    io.close()
    await closeDb?.()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  return { httpServer, service, history: historyRepo, close }
}
