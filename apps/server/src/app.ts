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
import type {
  GameHistoryRepository,
  GameRepository,
  GameStateStore,
  PlayerRepository,
  TokenVerifier,
} from './application/ports'
import { createDb } from './db/client'
import { CompositeGateway } from './infra/composite-gateway'
import { ConnectionRegistry } from './infra/connection-registry'
import { DurableGameRepository } from './infra/durable-game-repository'
import { FirebaseTokenVerifier } from './infra/firebase-token-verifier'
import { InMemoryGameRepository } from './infra/in-memory-game-repository'
import { PostgresGameStateStore } from './infra/postgres-game-store'
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
import { requireAuth } from './http/auth'
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
  /** Override token verification (tests inject a fake; default verifies Firebase ID tokens). */
  tokenVerifier?: TokenVerifier
  /**
   * Durable live-game storage. Tests inject an in-memory store (shared across
   * app instances to simulate a restart); production uses Postgres when a DB is
   * configured. Unset with no DB means games live only in memory.
   */
  gameStore?: GameStateStore
}

/** Events after which the current game state is worth persisting (consistent settle points). */
const PERSIST_TRIGGERS = new Set<string>([
  'bet-requested',
  'turn-started',
  'scoreboard-shown',
  'scoreboard-hidden',
  'bot-took-over',
  'player-rejoined',
])

/**
 * Composition root: wires the engine, use-cases and transports together.
 * Events go out over BOTH socket.io and SSE while the transports coexist;
 * each client picks one (see apps/web NEXT_PUBLIC_REALTIME_TRANSPORT).
 */
export const createApp = (options: AppOptions = {}): AppInstance => {
  const app = express()
  app.use(express.json())

  // WEB_ORIGINS locks CORS to the real frontend (comma-separated list, set in
  // production). Unset means local dev: reflect any origin so LAN phones work.
  const origins = (process.env.WEB_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const corsOrigin = origins.length ? origins : true
  app.use(cors({ origin: corsOrigin }))

  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: corsOrigin } })

  const verifier =
    options.tokenVerifier ??
    new FirebaseTokenVerifier(process.env.FIREBASE_PROJECT_ID ?? 'bridou-online')

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL
  let closeDb: (() => Promise<void>) | undefined
  let db: ReturnType<typeof createDb>['db'] | undefined
  if (databaseUrl) {
    const created = createDb(databaseUrl)
    db = created.db
    closeDb = async () => {
      await created.client.end({ timeout: 5 })
    }
  }

  // Live games survive a restart when there's durable storage (an injected store
  // or Postgres); otherwise they live only in memory (fine for local play).
  const gameStore = options.gameStore ?? (db ? new PostgresGameStateStore(db) : undefined)
  const games: GameRepository = gameStore
    ? new DurableGameRepository(gameStore)
    : new InMemoryGameRepository()

  const abandonment = new AbandonmentService({ games, ...options.abandonment })
  const eviction = new GameEviction({ games })

  let historyRepo: GameHistoryRepository
  let playerRepo: PlayerRepository
  if (options.history && options.players) {
    historyRepo = options.history
    playerRepo = options.players
  } else if (db) {
    historyRepo = new PostgresGameHistoryRepository(db)
    playerRepo = new PostgresPlayerRepository(db)
  } else {
    historyRepo = new InMemoryGameHistoryRepository()
    playerRepo = new InMemoryPlayerRepository()
  }

  const historyRecorder = new GameHistoryRecorder(historyRepo, playerRepo)

  // Presence flows in from every transport; abandonment reacts to it
  const registry = new ConnectionRegistry()
  const presence = new PresenceTracker(abandonment)
  registerConnectionHandlers(io, registry, presence, verifier)
  const sse = new SseGateway(presence)

  // Voice chat: browsers exchange WebRTC signaling through the /voice
  // namespace; the audio itself flows peer-to-peer and never touches us
  const voiceRooms = registerVoiceHandlers(io, verifier)

  // Events flow out through both transports, teed to abandonment, eviction,
  // and durable history (append-only event log + finished-game rows)
  const gateway = new InterceptingGateway(
    new CompositeGateway([new SocketIoGateway(io, registry), sse]),
    (gameId, event) => {
      abandonment.onDomainEvent(gameId, event)
      eviction.onDomainEvent(gameId, event)
      historyRecorder.onDomainEvent(gameId, event)
      // Persist the live game at consistent settle points so it survives a restart.
      if (PERSIST_TRIGGERS.has(event.type)) {
        const game = games.get(gameId)
        if (game) games.save(game)
      }
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

  // A rehydrated game emits through the live gateway, carries its bot seats, and
  // hands reconnection back to abandonment (wired here — these deps exist now).
  if (games instanceof DurableGameRepository) {
    games.bind({
      publisherFor: (id) => gateway.publisherFor(id),
      botSeatsOf: (id) => abandonment.sessionState(id).botSeats,
      onRehydrate: (game, botSeats) => abandonment.reconcileAfterLoad(game, botSeats),
    })
  }

  app.get('/api/games/:gameId/events', sse.handler(verifier))
  app.get('/api/games/:gameId/voice', requireAuth(verifier), (req, res) => {
    res.json({ participants: voiceRooms.rosterOf(req.params.gameId ?? '') })
  })
  app.use(createRoutes(service, verifier))

  const close = async (): Promise<void> => {
    sse.close()
    io.close()
    if (games instanceof DurableGameRepository) await games.flush()
    await closeDb?.()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  return { httpServer, service, history: historyRepo, close }
}
