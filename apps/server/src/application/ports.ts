import type { DomainEvent, EventPublisher, LobbySnapshot, PlayerInfo, RankingEntry, SessionState, ScoreboardEntry } from '@bridou/shared'
import type { CompletedRoundResult, CurrentRoundState, Game } from '@bridou/engine'

export interface GameRepository {
  get(gameId: string): Game | undefined
  save(game: Game): void
  delete(gameId: string): void
  /** Unfinished game the player is seated in, if any (from the in-memory cache). */
  findActiveByPlayerId(playerId: string): Game | undefined
  /**
   * Load a game into the cache from durable storage if it isn't already there
   * (used after a restart). No-op for the in-memory repository. Call before a
   * sync `get` on the reconnect paths.
   */
  hydrate?(gameId: string): Promise<Game | undefined>
  /** Durable lookup of a player's active game id, for reconnect after a restart. */
  findActivePlayerGameId?(playerId: string): Promise<string | null>
}

/** The mutable per-game row: the churning current round plus session state. */
export interface StoredGameCurrent {
  gameId: string
  leaderId: string
  currentRoundNumber: number
  scoreboardShowing: boolean
  playerOrder: PlayerInfo[]
  currentRound: CurrentRoundState | null
  botSeats: string[]
}

/**
 * Storage mechanism behind the durable game repository — the dumb read/write
 * half, with the caching/rehydration policy living in the repository. Postgres
 * in production; an in-memory implementation makes restart behavior testable.
 */
export interface GameStateStore {
  upsertCurrent(row: StoredGameCurrent): Promise<void>
  /** Write a finished round's result. Idempotent — the same round is written once. */
  insertRoundResult(
    gameId: string,
    roundNumber: number,
    results: CompletedRoundResult['results'],
  ): Promise<void>
  load(
    gameId: string,
  ): Promise<{ current: StoredGameCurrent; results: CompletedRoundResult[] } | null>
  delete(gameId: string): Promise<void>
  /** The game id an unfinished player is seated in, if any (durable lookup). */
  findGameIdByPlayer(playerId: string): Promise<string | null>
}

/**
 * Everything the application needs from the realtime transport.
 * Implemented by socket.io today; an SSE implementation slots in here
 * without touching use-cases or the engine.
 */
export interface RealtimeGateway {
  /** Publisher that fans a game's domain events out to its players. */
  publisherFor(gameId: string): EventPublisher
  /** Full lobby state on every roster change — clients replace, never merge. */
  lobbyUpdated(lobbyId: string, lobby: LobbySnapshot): void
  gameStarted(gameId: string): void
}

/**
 * Turns a client credential (Firebase ID token) into a trusted identity.
 * Every transport authenticates through this port; tests inject a fake.
 */
export interface TokenVerifier {
  /** Resolves the verified player, or null when the token is invalid/expired. */
  verify(token: string): Promise<PlayerInfo | null>
}

/** Seat control as GameService sees it (implemented by AbandonmentService). */
export interface GameSessionMonitor {
  /** Throws while the game is paused waiting on an abandoned seat. */
  assertPlayable(gameId: string): void
  sessionState(gameId: string): SessionState
  /** Seats that are bots from the start; call before the game's first event. */
  registerBotSeats(gameId: string, playerIds: string[]): void
}

/** One persisted domain event with server-added envelope fields. */
export interface StoredGameEvent {
  gameId: string
  seq: number
  type: DomainEvent['type']
  playerId: string | null
  payload: DomainEvent
  createdAt: Date
}

export interface FinishedGamePlayer {
  playerId: string
  seatIndex: number
  isBot: boolean
  finalPoints: number
  bailadasCount: number
  rank: number
}

export interface FinishedGameRecord {
  gameId: string
  startedAt: Date
  endedAt: Date
  leaderId: string
  players: FinishedGamePlayer[]
  finalScoreboard: ScoreboardEntry[]
  /** Counts toward the leaderboard — started with no bot seat. */
  ranked: boolean
}

/** Append-only history for analytics — not the live game source of truth. */
export interface GameHistoryRepository {
  /** Ensure a games row exists (status in_progress) before events land. */
  ensureGameStarted(input: {
    gameId: string
    leaderId: string
    playerCount: number
    startedAt?: Date
  }): Promise<void>
  appendEvent(gameId: string, seq: number, event: DomainEvent): Promise<void>
  saveFinishedGame(record: FinishedGameRecord): Promise<void>
  getGameEvents(gameId: string): Promise<StoredGameEvent[]>
  listPlayerGames(playerId: string): Promise<string[]>
  /** All-time leaderboard over ranked games only, best first. */
  getLeaderboard(): Promise<RankingEntry[]>
}

export interface PlayerRepository {
  upsert(player: PlayerInfo): Promise<void>
}
