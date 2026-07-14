import { Game, type GameState, type Scheduler } from '@bridou/engine'
import type { EventPublisher } from '@bridou/shared'
import type { GameRepository, GameStateStore } from '../application/ports'

/** Late-bound deps (they reference the gateway / abandonment service, wired last). */
export interface GamePersistenceBindings {
  /** The live publisher a rehydrated game emits through (resumed transitions). */
  publisherFor: (gameId: string) => EventPublisher
  /** Bot-controlled seats to persist alongside the game (queue bots + takeovers). */
  botSeatsOf: (gameId: string) => string[]
  /** Called once when a game is loaded from storage, to reconcile seat control. */
  onRehydrate: (game: Game, botSeats: string[]) => void
}

interface CacheEntry {
  game: Game
  /** How many completed-round rows are already written, so we never resend them. */
  persistedRounds: number
}

/**
 * Durable game repository: an in-memory write-through cache backed by a
 * `GameStateStore`. A live game reads from the cache (identical to the plain
 * in-memory repo); storage is only read on a cache miss, i.e. right after a
 * restart, when the game is rebuilt and `resume()`d.
 *
 * Writes are economical: the churning current round is a single small upserted
 * row, and each finished round is written once — never rewritten as the game
 * grows. Only rounds the game has advanced PAST are written, since during a
 * round transition the just-finished round is still the current round.
 */
export class DurableGameRepository implements GameRepository {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly chains = new Map<string, Promise<void>>()
  private readonly loading = new Map<string, Promise<Game | undefined>>()
  private bindings?: GamePersistenceBindings

  constructor(
    private readonly store: GameStateStore,
    private readonly scheduler?: Scheduler,
  ) {}

  /** Wire the gateway/abandonment deps — done at the composition root after both exist. */
  bind(bindings: GamePersistenceBindings): void {
    this.bindings = bindings
  }

  private deps(): GamePersistenceBindings {
    if (!this.bindings) throw new Error('DurableGameRepository used before bind()')
    return this.bindings
  }

  get(gameId: string): Game | undefined {
    return this.cache.get(gameId)?.game
  }

  findActiveByPlayerId(playerId: string): Game | undefined {
    for (const { game } of this.cache.values()) {
      if (!game.finished && game.hasPlayer(playerId)) return game
    }
    return undefined
  }

  save(game: Game): void {
    const state = game.toState()
    const botSeats = this.deps().botSeatsOf(game.id)
    const entry = this.cache.get(game.id)
    if (entry) entry.game = game
    else this.cache.set(game.id, { game, persistedRounds: 0 })

    const completed = state.completedRounds.filter((r) => r.roundNumber < state.currentRoundNumber)

    this.enqueue(game.id, async () => {
      const cur = this.cache.get(game.id)
      const alreadyWritten = cur?.persistedRounds ?? 0
      for (const round of completed.slice(alreadyWritten)) {
        await this.store.insertRoundResult(game.id, round.roundNumber, round.results)
      }
      if (cur) cur.persistedRounds = Math.max(alreadyWritten, completed.length)

      await this.store.upsertCurrent({
        gameId: game.id,
        leaderId: state.leaderId,
        currentRoundNumber: state.currentRoundNumber,
        scoreboardShowing: state.scoreboardShowing,
        playerOrder: state.playerOrder,
        currentRound: state.currentRound,
        botSeats,
      })
    })
  }

  delete(gameId: string): void {
    this.cache.delete(gameId)
    this.enqueue(gameId, () => this.store.delete(gameId))
  }

  async hydrate(gameId: string): Promise<Game | undefined> {
    const cached = this.cache.get(gameId)
    if (cached) return cached.game
    const inflight = this.loading.get(gameId)
    if (inflight) return inflight

    const load = this.load(gameId).finally(() => this.loading.delete(gameId))
    this.loading.set(gameId, load)
    return load
  }

  async findActivePlayerGameId(playerId: string): Promise<string | null> {
    return this.store.findGameIdByPlayer(playerId)
  }

  /** Wait for queued writes to settle (tests; also useful before a clean shutdown). */
  async flush(gameId?: string): Promise<void> {
    if (gameId) {
      await this.chains.get(gameId)
      return
    }
    await Promise.all([...this.chains.values()])
  }

  private async load(gameId: string): Promise<Game | undefined> {
    const stored = await this.store.load(gameId)
    if (!stored) return undefined

    const state: GameState = {
      id: gameId,
      leaderId: stored.current.leaderId,
      currentRoundNumber: stored.current.currentRoundNumber,
      scoreboardShowing: stored.current.scoreboardShowing,
      playerOrder: stored.current.playerOrder,
      completedRounds: stored.results,
      currentRound: stored.current.currentRound,
    }

    const game = Game.fromState(state, {
      publisher: this.deps().publisherFor(gameId),
      ...(this.scheduler ? { scheduler: this.scheduler } : {}),
    })
    game.resume()
    this.cache.set(gameId, { game, persistedRounds: stored.results.length })
    this.deps().onRehydrate(game, stored.current.botSeats)
    return game
  }

  private enqueue(gameId: string, fn: () => Promise<void>): void {
    const prev = this.chains.get(gameId) ?? Promise.resolve()
    const next = prev.then(fn).catch((err) => {
      console.error('game state persistence failed', err)
    })
    this.chains.set(gameId, next)
  }
}
