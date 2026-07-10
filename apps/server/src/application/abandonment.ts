import {
  GameError,
  createMonteCarloBot,
  systemScheduler,
  type BotStrategy,
  type Scheduler,
} from '@bridou/engine'
import type { DomainEvent, SessionState } from '@bridou/shared'
import type { GameRepository, RealtimeGateway } from './ports'
import type { PresenceListener } from './presence'

/** The moves the bot may make — the same use-cases humans go through. */
export interface SeatActions {
  placeBet(gameId: string, playerId: string, bet: number): void
  playCard(gameId: string, playerId: string, card: string): void
}

export interface AbandonmentConfig {
  /** Ignore blips shorter than this before declaring an abandonment. */
  debounceMs?: number
  /** How long the game waits for the player before the bot takes the seat. */
  graceMs?: number
  /** Small delay before each bot move, so plays are followable on screen. */
  botThinkMs?: number
}

interface Deps extends AbandonmentConfig {
  games: GameRepository
  scheduler?: Scheduler
  bot?: BotStrategy
  now?: () => number
}

/**
 * Owns seat control: watches presence, pauses the game while someone is in
 * their grace period, hands abandoned seats to the bot, and gives them back
 * on rejoin. The bot only sees `snapshot()` + `perspective()` — the same
 * information a human player has — and acts through the normal use-cases.
 */
export class AbandonmentService implements PresenceListener {
  private readonly games: GameRepository
  private readonly scheduler: Scheduler
  private readonly bot: BotStrategy
  private readonly now: () => number
  private readonly debounceMs: number
  private readonly graceMs: number
  private readonly botThinkMs: number

  // Late-bound at the composition root (they reference each other)
  private gateway?: RealtimeGateway
  private actions?: SeatActions

  /** gameId → playerId → resumeAt; any entry means the game is paused. */
  private readonly abandoned = new Map<string, Map<string, number>>()
  private readonly botSeats = new Map<string, Set<string>>()
  private readonly online = new Set<string>()
  /** Bumped on every presence change; pending timers no-op when stale. */
  private readonly generations = new Map<string, number>()

  constructor(deps: Deps) {
    this.games = deps.games
    this.scheduler = deps.scheduler ?? systemScheduler
    this.bot = deps.bot ?? createMonteCarloBot()
    this.now = deps.now ?? Date.now
    this.debounceMs = deps.debounceMs ?? 3_000
    this.graceMs = deps.graceMs ?? 30_000
    this.botThinkMs = deps.botThinkMs ?? 800
  }

  bind({ gateway, actions }: { gateway: RealtimeGateway; actions: SeatActions }): void {
    this.gateway = gateway
    this.actions = actions
  }

  /** Throws while any seat is in its grace period. */
  assertPlayable(gameId: string): void {
    if (this.abandoned.get(gameId)?.size) {
      throw new GameError('Game is paused while a player is away')
    }
  }

  /** Seats that never had a human (queue bots) — bot-controlled from move one. */
  registerBotSeats(gameId: string, playerIds: string[]): void {
    if (!playerIds.length) return
    const bots = this.botSeats.get(gameId) ?? new Set<string>()
    playerIds.forEach((id) => bots.add(id))
    this.botSeats.set(gameId, bots)
  }

  sessionState(gameId: string): SessionState {
    return {
      abandoned: [...(this.abandoned.get(gameId) ?? [])].map(([playerId, resumeAt]) => ({
        playerId,
        resumeAt,
      })),
      botSeats: [...(this.botSeats.get(gameId) ?? [])],
    }
  }

  playerOnline(gameId: string, playerId: string): void {
    this.online.add(`${gameId}:${playerId}`)
    this.bumpGeneration(gameId, playerId)

    const wasAbandoned = this.abandoned.get(gameId)?.delete(playerId) ?? false
    if (!this.abandoned.get(gameId)?.size) this.abandoned.delete(gameId)
    const wasBot = this.botSeats.get(gameId)?.delete(playerId) ?? false

    if (wasAbandoned || wasBot) {
      this.publish(gameId, { type: 'player-rejoined', playerId })
      // The pause may have just lifted — a waiting bot seat can act now
      if (!this.abandoned.get(gameId)?.size) this.actIfBotTurn(gameId)
    }
  }

  playerOffline(gameId: string, playerId: string): void {
    this.online.delete(`${gameId}:${playerId}`)

    const game = this.games.get(gameId)
    if (!game?.hasPlayer(playerId) || game.finished) return

    const generation = this.bumpGeneration(gameId, playerId)
    this.scheduler.schedule(() => {
      if (!this.isCurrent(gameId, playerId, generation)) return
      this.declareAbandoned(gameId, playerId, generation)
    }, this.debounceMs)
  }

  /** Fed every published domain event by the intercepting gateway. */
  onDomainEvent(gameId: string, event: DomainEvent): void {
    if (event.type === 'game-ended') {
      this.cleanup(gameId)
      return
    }
    if (
      (event.type === 'bet-requested' || event.type === 'play-requested') &&
      this.botSeats.get(gameId)?.has(event.playerId)
    ) {
      this.scheduler.schedule(() => this.actIfBotTurn(gameId), this.botThinkMs)
    }
  }

  private declareAbandoned(gameId: string, playerId: string, generation: number): void {
    const game = this.games.get(gameId)
    if (!game || game.finished) return

    const resumeAt = this.now() + this.graceMs
    const seats = this.abandoned.get(gameId) ?? new Map<string, number>()
    seats.set(playerId, resumeAt)
    this.abandoned.set(gameId, seats)
    this.publish(gameId, { type: 'player-abandoned', playerId, resumeAt })

    this.scheduler.schedule(() => {
      if (!this.isCurrent(gameId, playerId, generation)) return
      this.takeOver(gameId, playerId)
    }, this.graceMs)
  }

  private takeOver(gameId: string, playerId: string): void {
    const seats = this.abandoned.get(gameId)
    if (!seats?.delete(playerId)) return
    if (!seats.size) this.abandoned.delete(gameId)

    const bots = this.botSeats.get(gameId) ?? new Set<string>()
    bots.add(playerId)
    this.botSeats.set(gameId, bots)
    this.publish(gameId, { type: 'bot-took-over', playerId })

    // Resume the game if it was stuck on this seat's turn
    if (!this.abandoned.get(gameId)?.size) this.actIfBotTurn(gameId)
  }

  private actIfBotTurn(gameId: string): void {
    try {
      if (this.abandoned.get(gameId)?.size) return // still paused for someone else
      const game = this.games.get(gameId)
      const bots = this.botSeats.get(gameId)
      if (!game || game.finished || !bots?.size || !this.actions) return

      const round = game.currentRound
      if (round.betting) {
        const current = round.currentPlayer
        if (!bots.has(current.id)) return
        const bet = this.bot.decideBet({
          playerId: current.id,
          snapshot: game.snapshot(),
          hand: game.perspective(current.id).playableCards.map((c) => c.value),
          availableBets: round.getAvailableBets(current.id),
        })
        this.actions.placeBet(gameId, current.id, bet)
        return
      }

      const turn = round.currentTurn
      if (!turn || turn.isComplete) return
      const current = turn.currentPlayer
      if (!bots.has(current.id)) return
      const card = this.bot.decideCard({
        playerId: current.id,
        snapshot: game.snapshot(),
        playableCards: game.perspective(current.id).playableCards,
      })
      this.actions.playCard(gameId, current.id, card)
    } catch (err) {
      // A stale timer or a race with a rejoin — never crash the server for it
      console.error('bot action failed', err)
    }
  }

  private cleanup(gameId: string): void {
    this.abandoned.delete(gameId)
    this.botSeats.delete(gameId)
  }

  private bumpGeneration(gameId: string, playerId: string): number {
    const key = `${gameId}:${playerId}`
    const generation = (this.generations.get(key) ?? 0) + 1
    this.generations.set(key, generation)
    return generation
  }

  private isCurrent(gameId: string, playerId: string, generation: number): boolean {
    return (
      this.generations.get(`${gameId}:${playerId}`) === generation &&
      !this.online.has(`${gameId}:${playerId}`)
    )
  }

  private publish(gameId: string, event: DomainEvent): void {
    this.gateway?.publisherFor(gameId).publish(event)
  }
}
