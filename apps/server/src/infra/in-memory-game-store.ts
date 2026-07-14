import type { CompletedRoundResult } from '@bridou/engine'
import type { GameStateStore, StoredGameCurrent } from '../application/ports'

/**
 * In-memory live-game storage. Used for tests — sharing one instance across two
 * app instances simulates durable state surviving a server restart, which is
 * how the restart e2e proves games are recoverable without a real database.
 */
export class InMemoryGameStateStore implements GameStateStore {
  private readonly current = new Map<string, StoredGameCurrent>()
  private readonly results = new Map<string, Map<number, CompletedRoundResult>>()

  async upsertCurrent(row: StoredGameCurrent): Promise<void> {
    // Store a deep copy so later mutations of the live game don't leak in.
    this.current.set(row.gameId, structuredClone(row))
  }

  async insertRoundResult(
    gameId: string,
    roundNumber: number,
    results: CompletedRoundResult['results'],
  ): Promise<void> {
    const byRound = this.results.get(gameId) ?? new Map<number, CompletedRoundResult>()
    if (!byRound.has(roundNumber)) {
      byRound.set(roundNumber, structuredClone({ roundNumber, results }))
    }
    this.results.set(gameId, byRound)
  }

  async load(
    gameId: string,
  ): Promise<{ current: StoredGameCurrent; results: CompletedRoundResult[] } | null> {
    const current = this.current.get(gameId)
    if (!current) return null
    const results = [...(this.results.get(gameId)?.values() ?? [])].sort(
      (a, b) => a.roundNumber - b.roundNumber,
    )
    return structuredClone({ current, results })
  }

  async delete(gameId: string): Promise<void> {
    this.current.delete(gameId)
    this.results.delete(gameId)
  }

  async findGameIdByPlayer(playerId: string): Promise<string | null> {
    for (const row of this.current.values()) {
      if (row.playerOrder.some((p) => p.id === playerId)) return row.gameId
    }
    return null
  }
}
