import type { EventPublisher, PlayerInfo, SessionState } from '@bridou/shared'
import type { Game } from '@bridou/engine'

export interface GameRepository {
  get(gameId: string): Game | undefined
  save(game: Game): void
  delete(gameId: string): void
}

/**
 * Everything the application needs from the realtime transport.
 * Implemented by socket.io today; an SSE implementation slots in here
 * without touching use-cases or the engine.
 */
export interface RealtimeGateway {
  /** Publisher that fans a game's domain events out to its players. */
  publisherFor(gameId: string): EventPublisher
  playerJoinedQueue(queueId: string, player: PlayerInfo): void
  gameStarted(gameId: string): void
}

/** Seat control as GameService sees it (implemented by AbandonmentService). */
export interface GameSessionMonitor {
  /** Throws while the game is paused waiting on an abandoned seat. */
  assertPlayable(gameId: string): void
  sessionState(gameId: string): SessionState
}
