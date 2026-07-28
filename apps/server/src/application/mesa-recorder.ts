import type { DomainEvent } from '@bridou/shared'
import type { MesaService } from './mesa'

/**
 * Feeds finished games back into their mesa's season standings.
 *
 * Sits on the same domain-event tee as history and conquistas. Bailadas are
 * counted here from `round-ended` rather than borrowed from the history
 * recorder, so the two never have to be ordered against each other.
 */
export class MesaResultRecorder {
  /** gameId → playerId → bailadas so far. */
  private readonly bailadas = new Map<string, Map<string, number>>()
  private readonly chains = new Map<string, Promise<void>>()

  constructor(private readonly mesas: MesaService) {}

  /** Called when a game starts from a mesa. */
  registerGame(gameId: string, mesaId: string | null): void {
    this.bailadas.set(gameId, new Map())
    if (!mesaId) return
    this.enqueue(gameId, () => this.mesas.linkGame(gameId, mesaId))
  }

  onDomainEvent(gameId: string, event: DomainEvent): void {
    if (event.type === 'round-ended') {
      const counts = this.bailadas.get(gameId) ?? new Map<string, number>()
      for (const bailador of event.bailadores) {
        counts.set(bailador.id, (counts.get(bailador.id) ?? 0) + 1)
      }
      this.bailadas.set(gameId, counts)
      return
    }

    if (event.type !== 'game-ended') return

    const counts = this.bailadas.get(gameId) ?? new Map<string, number>()
    const scoreboard = event.scoreboard.map((entry) => ({
      id: entry.id,
      totalPoints: entry.totalPoints,
      ...(entry.isBot ? { isBot: true } : {}),
    }))

    this.enqueue(gameId, async () => {
      await this.mesas.recordFinishedGame({
        gameId,
        scoreboard,
        bailadasByPlayer: Object.fromEntries(counts),
      })
      this.bailadas.delete(gameId)
    })
  }

  async flush(gameId?: string): Promise<void> {
    if (gameId) {
      await this.chains.get(gameId)
      return
    }
    await Promise.all([...this.chains.values()])
  }

  private enqueue(gameId: string, fn: () => Promise<void>): void {
    const prev = this.chains.get(gameId) ?? Promise.resolve()
    const next = prev.then(fn).catch((err) => {
      console.error('mesa result persistence failed', err)
    })
    this.chains.set(gameId, next)
  }
}
