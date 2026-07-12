import type { DomainEvent, EventPublisher, LobbySnapshot, PlayerInfo, SessionState, ScoreboardEntry } from '@bridou/shared'
import type { Game } from '@bridou/engine'

export interface GameRepository {
  get(gameId: string): Game | undefined
  save(game: Game): void
  delete(gameId: string): void
  /** Unfinished game the player is seated in, if any. */
  findActiveByPlayerId(playerId: string): Game | undefined
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
}

export interface PlayerRepository {
  upsert(player: PlayerInfo): Promise<void>
}
