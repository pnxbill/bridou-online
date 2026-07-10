import type { DomainEvent } from '@bridou/shared'
import { systemScheduler, type Scheduler } from '@bridou/engine'
import type { GameRepository } from './ports'

/** How long finished games stay reachable for end-screen / late snapshot refetch. */
export const GAME_EVICTION_TTL_MS = 5 * 60 * 1000

/**
 * Drops finished games from the repository after a TTL so the in-memory
 * store does not grow without bound across many sessions.
 */
export class GameEviction {
  private readonly games: GameRepository
  private readonly scheduler: Scheduler
  private readonly ttlMs: number

  constructor(deps: {
    games: GameRepository
    scheduler?: Scheduler
    ttlMs?: number
  }) {
    this.games = deps.games
    this.scheduler = deps.scheduler ?? systemScheduler
    this.ttlMs = deps.ttlMs ?? GAME_EVICTION_TTL_MS
  }

  onDomainEvent(gameId: string, event: DomainEvent): void {
    if (event.type !== 'game-ended') return
    this.scheduler.schedule(() => this.games.delete(gameId), this.ttlMs)
  }
}
