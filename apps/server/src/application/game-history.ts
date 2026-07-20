import { cardSuit, type DomainEvent, type PlayerInfo, type ScoreboardEntry } from '@bridou/shared'
import type { GameHistoryRepository, PlayerRepository, StoredGameEvent } from './ports'

/**
 * Persists the domain event stream and finished-game summaries.
 * Writes are async and never throw into the play path — failures are logged.
 * Per-game writes are chained so ensureGameStarted always lands before events.
 */
export class GameHistoryRecorder {
  private readonly seq = new Map<string, number>()
  private readonly startedAt = new Map<string, Date>()
  private readonly bailadas = new Map<string, Map<string, number>>()
  private readonly rosters = new Map<string, PlayerInfo[]>()
  private readonly leaderIds = new Map<string, string>()
  private readonly chains = new Map<string, Promise<void>>()
  /** Games where a bot played at any point — bot seat at start or a takeover. */
  private readonly botTainted = new Set<string>()

  constructor(
    private readonly history: GameHistoryRepository,
    private readonly players: PlayerRepository,
  ) {}

  /** Call once when a game is created, before the first engine event. */
  recordGameStarted(input: {
    gameId: string
    leaderId: string
    roster: PlayerInfo[]
  }): void {
    const at = new Date()
    this.startedAt.set(input.gameId, at)
    this.seq.set(input.gameId, 0)
    this.bailadas.set(input.gameId, new Map())
    this.rosters.set(input.gameId, input.roster.map((p) => ({ ...p })))
    this.leaderIds.set(input.gameId, input.leaderId)
    if (input.roster.some((p) => p.isBot)) this.botTainted.add(input.gameId)

    this.enqueue(input.gameId, async () => {
      for (const player of input.roster) {
        await this.players.upsert(player)
      }
      await this.history.ensureGameStarted({
        gameId: input.gameId,
        leaderId: input.leaderId,
        playerCount: input.roster.length,
        startedAt: at,
      })
    })
  }

  /** Fed every published domain event (same hook as abandonment / eviction). */
  onDomainEvent(gameId: string, event: DomainEvent): void {
    const next = (this.seq.get(gameId) ?? 0) + 1
    this.seq.set(gameId, next)

    if (event.type === 'bot-took-over') this.botTainted.add(gameId)

    if (event.type === 'round-ended') {
      const counts = this.bailadas.get(gameId) ?? new Map<string, number>()
      for (const b of event.bailadores) {
        counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
      }
      this.bailadas.set(gameId, counts)
    }

    this.enqueue(gameId, async () => {
      await this.history.appendEvent(gameId, next, event)
      if (event.type === 'game-ended') {
        await this.finalize(gameId, event.scoreboard)
      }
    })
  }

  private enqueue(gameId: string, fn: () => Promise<void>): void {
    const prev = this.chains.get(gameId) ?? Promise.resolve()
    const next = prev.then(fn).catch((err) => {
      console.error('game history persistence failed', err)
    })
    this.chains.set(gameId, next)
  }

  /** Wait until queued writes for a game (or all games) have settled. */
  async flush(gameId?: string): Promise<void> {
    if (gameId) {
      await this.chains.get(gameId)
      return
    }
    await Promise.all([...this.chains.values()])
  }

  private async finalize(gameId: string, scoreboard: ScoreboardEntry[]): Promise<void> {
    const roster = this.rosters.get(gameId)
    if (!roster) return

    const ranked = [...scoreboard].sort((a, b) => b.totalPoints - a.totalPoints)
    const bailadas = this.bailadas.get(gameId) ?? new Map()

    await this.history.saveFinishedGame({
      gameId,
      startedAt: this.startedAt.get(gameId) ?? new Date(),
      endedAt: new Date(),
      leaderId: this.leaderIds.get(gameId) ?? ranked[0]?.id ?? roster[0]!.id,
      finalScoreboard: scoreboard,
      ranked: !this.botTainted.has(gameId),
      players: roster.map((p, seatIndex) => {
        const entry = scoreboard.find((s) => s.id === p.id)
        const rank = ranked.findIndex((s) => s.id === p.id) + 1
        return {
          playerId: p.id,
          seatIndex,
          isBot: !!p.isBot,
          finalPoints: entry?.totalPoints ?? 0,
          bailadasCount: bailadas.get(p.id) ?? 0,
          rank: rank || roster.length,
        }
      }),
    })

    this.seq.delete(gameId)
    this.startedAt.delete(gameId)
    this.bailadas.delete(gameId)
    this.rosters.delete(gameId)
    this.leaderIds.delete(gameId)
    this.chains.delete(gameId)
    this.botTainted.delete(gameId)
  }
}

/**
 * Fraction of tricks where `playerId` led and opened with the trunfo suit.
 * Works over the stored event log — the proof query for analytics.
 */
export const trumpLeadRate = (
  events: StoredGameEvent[],
  playerId: string,
): { leads: number; trumpLeads: number; rate: number | null } => {
  let leads = 0
  let trumpLeads = 0
  let pending: { leaderId: string; trunfoSuit: string } | null = null

  for (const { payload } of events) {
    if (payload.type === 'turn-started') {
      const leaderId = payload.turn.players[0]?.id
      if (!leaderId) {
        pending = null
        continue
      }
      pending = {
        leaderId,
        trunfoSuit: cardSuit(payload.turn.trunfo),
      }
      continue
    }

    if (payload.type === 'card-played' && pending && payload.playedCards.length === 1) {
      if (pending.leaderId === playerId) {
        leads++
        if (cardSuit(payload.card) === pending.trunfoSuit) trumpLeads++
      }
      pending = null
    }

    if (payload.type === 'turn-ended') pending = null
  }

  return {
    leads,
    trumpLeads,
    rate: leads === 0 ? null : trumpLeads / leads,
  }
}
