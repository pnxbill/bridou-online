import cors from 'cors'
import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import { AbandonmentService } from './application/abandonment'
import { AchievementTracker } from './application/achievements'
import { DailyHandService } from './application/daily-hand'
import { GameEviction } from './application/game-eviction'
import { GameHistoryRecorder } from './application/game-history'
import { GameService } from './application/game-service'
import { LobbyRegistry } from './application/lobby'
import { MesaService } from './application/mesa'
import { MesaResultRecorder } from './application/mesa-recorder'
import { OnlineTracker } from './application/online'
import { PresenceTracker } from './application/presence'
import type {
  AchievementRepository,
  GameHistoryRepository,
  GameRepository,
  DailyRepository,
  GameStateStore,
  MesaRepository,
  PlayerRepository,
  PlayerStatsRepository,
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
  InMemoryAchievementRepository,
  InMemoryPlayerStatsRepository,
} from './infra/in-memory-engagement'
import { InMemoryDailyRepository } from './infra/in-memory-daily'
import { InMemoryMesaRepository } from './infra/in-memory-mesa'
import { PostgresDailyRepository } from './infra/postgres-daily'
import { PostgresMesaRepository } from './infra/postgres-mesa'
import {
  InMemoryGameHistoryRepository,
  InMemoryPlayerRepository,
} from './infra/in-memory-history'
import { InterceptingGateway } from './infra/intercepting-gateway'
import {
  PostgresAchievementRepository,
  PostgresPlayerStatsRepository,
} from './infra/postgres-engagement'
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
  achievements: AchievementRepository
  playerStats: PlayerStatsRepository
  mesas: MesaService
  /** Lets tests await the async conquista / mesa writes before asserting. */
  flushEngagement(gameId?: string): Promise<void>
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
  /** Override conquista / career-stat storage (tests inject in-memory repos). */
  achievements?: AchievementRepository
  playerStats?: PlayerStatsRepository
  /** Override mesa/season storage. */
  mesas?: MesaRepository
  /** Override Mão do Dia attempt storage. */
  dailyAttempts?: DailyRepository
  /** Fixed clock for the time-of-day conquistas and season rollover — tests pin this. */
  now?: () => Date
  /** Shorten seasons so tests can watch a rollover. */
  seasonWeeks?: number
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

  let achievementRepo: AchievementRepository
  let statsRepo: PlayerStatsRepository
  if (options.achievements && options.playerStats) {
    achievementRepo = options.achievements
    statsRepo = options.playerStats
  } else if (db) {
    achievementRepo = new PostgresAchievementRepository(db)
    statsRepo = new PostgresPlayerStatsRepository(db)
  } else {
    achievementRepo = new InMemoryAchievementRepository()
    statsRepo = new InMemoryPlayerStatsRepository()
  }

  const achievementTracker = new AchievementTracker({
    achievements: achievementRepo,
    stats: statsRepo,
    ...(options.now ? { now: options.now } : {}),
  })

  const mesaRepo: MesaRepository =
    options.mesas ?? (db ? new PostgresMesaRepository(db) : new InMemoryMesaRepository())
  const mesaService = new MesaService(mesaRepo, playerRepo, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.seasonWeeks !== undefined ? { seasonWeeks: options.seasonWeeks } : {}),
  })
  const mesaRecorder = new MesaResultRecorder(mesaService)
  const online = new OnlineTracker()

  const dailyRepo: DailyRepository =
    options.dailyAttempts ?? (db ? new PostgresDailyRepository(db) : new InMemoryDailyRepository())
  const dailyService = new DailyHandService()

  // Presence flows in from every transport; abandonment reacts to it
  const registry = new ConnectionRegistry()
  const presence = new PresenceTracker(abandonment, (playerId) => online.touch(playerId))
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
      achievementTracker.onDomainEvent(gameId, event)
      mesaRecorder.onDomainEvent(gameId, event)
      // Persist the live game at consistent settle points so it survives a restart.
      if (PERSIST_TRIGGERS.has(event.type)) {
        const game = games.get(gameId)
        if (game) games.save(game)
      }
    },
  )

  const service = new GameService(games, new LobbyRegistry(), gateway, abandonment, {
    onGameStarted: (game, { mesaId }) => {
      historyRecorder.recordGameStarted({
        gameId: game.id,
        leaderId: game.leaderId,
        roster: game.players,
      })
      achievementTracker.registerGame(game.id, game.players, game.leaderId)
      mesaRecorder.registerGame(game.id, mesaId)
    },
  })
  abandonment.bind({ gateway, actions: service })
  achievementTracker.bind({ publisherFor: (id) => gateway.publisherFor(id) })

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
  app.use(
    createRoutes({
      service,
      verifier,
      history: historyRepo,
      achievements: achievementRepo,
      playerStats: statsRepo,
      mesas: mesaService,
      presence: online,
      daily: dailyService,
      dailyAttempts: dailyRepo,
      players: playerRepo,
    }),
  )

  const flushEngagement = async (gameId?: string): Promise<void> => {
    await historyRecorder.flush(gameId)
    await achievementTracker.flush(gameId)
    await mesaRecorder.flush(gameId)
  }

  const close = async (): Promise<void> => {
    sse.close()
    io.close()
    await achievementTracker.flush()
    await mesaRecorder.flush()
    if (games instanceof DurableGameRepository) await games.flush()
    await closeDb?.()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }

  return {
    httpServer,
    service,
    history: historyRepo,
    achievements: achievementRepo,
    playerStats: statsRepo,
    mesas: mesaService,
    flushEngagement,
    close,
  }
}
