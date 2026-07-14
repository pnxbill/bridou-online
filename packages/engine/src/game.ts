import {
  MAX_PLAYERS,
  TOTAL_ROUNDS,
  type EventPublisher,
  type GameSnapshot,
  type PlayerInfo,
  type PlayerPerspective,
  type ScoreboardEntry,
} from '@bridou/shared'
import { GameError } from './errors'
import type { RoundPlayerState } from './player'
import { systemScheduler, type Rng, type Scheduler } from './ports'
import { Round, type RoundDeps } from './round'
import type { GameState } from './state'

/** The mid-game scoreboard pops up after this round. */
const SCOREBOARD_ROUND = 7

export interface GameDeps {
  publisher: EventPublisher
  scheduler?: Scheduler
  rng?: Rng
}

export interface GameConfig {
  id: string
  leaderId: string
  players: PlayerInfo[]
}

export class Game {
  readonly id: string
  readonly leaderId: string
  currentRoundNumber = 1
  scoreboardShowing = false

  /** Betting order for the current round; rotates one seat every round. */
  private playerOrder: PlayerInfo[]
  /** Completed rounds, in order. */
  readonly rounds: Round[] = []
  private _currentRound: Round | null = null

  private readonly publisher: EventPublisher
  private readonly scheduler: Scheduler
  private readonly rng: Rng
  /** Pause between rounds so players can see the result. */
  private readonly roundTransitionDelay: number

  constructor({ id, leaderId, players }: GameConfig, deps: GameDeps) {
    if (players.length < 2) throw new GameError('Required at least 2 players')
    if (players.length > MAX_PLAYERS) throw new GameError(`Maximum of ${MAX_PLAYERS} players`)
    this.id = id
    this.leaderId = leaderId
    this.playerOrder = [...players]
    this.publisher = deps.publisher
    this.scheduler = deps.scheduler ?? systemScheduler
    this.rng = deps.rng ?? Math.random
    // long enough for the final trick to resolve AND the round-result
    // celebration to land before the next deal
    this.roundTransitionDelay = 3500 + players.length * 500
  }

  get currentRound(): Round {
    if (!this._currentRound) throw new GameError('Game has not started')
    return this._currentRound
  }

  get players(): PlayerInfo[] {
    return this.playerOrder
  }

  get finished(): boolean {
    return this.rounds.length === TOTAL_ROUNDS
  }

  hasPlayer(playerId: string): boolean {
    return this.playerOrder.some((p) => p.id === playerId)
  }

  start(): void {
    if (this._currentRound) throw new GameError('Game already started')
    this.startRound()
  }

  placeBet(playerId: string, bet: number): void {
    this.currentRound.placeBet(playerId, bet)
  }

  playCard(playerId: string, card: string): void {
    this.currentRound.playCard(playerId, card)
  }

  closeScoreboard(): void {
    this.scoreboardShowing = false
    this.publisher.publish({ type: 'scoreboard-hidden' })
  }

  /** Total points per player across completed rounds, best first. */
  get scoreboard(): ScoreboardEntry[] {
    return this.playerOrder
      .map((player) => ({
        id: player.id,
        name: player.name,
        ...(player.photoURL !== undefined && { photoURL: player.photoURL }),
        ...(player.isBot && { isBot: true }),
        totalPoints: this.rounds.reduce(
          (acc, round) => acc + (round.players.find((p) => p.id === player.id)?.points ?? 0),
          0,
        ),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
  }

  snapshot(): GameSnapshot {
    return {
      id: this.id,
      leaderId: this.leaderId,
      currentRoundNumber: this.currentRoundNumber,
      scoreboardShowing: this.scoreboardShowing,
      finished: this.finished,
      currentRound: this.currentRound.snapshot(),
      scoreboard: this.scoreboard,
    }
  }

  /** Serialize the live game so it can survive a server restart (see GameState). */
  toState(): GameState {
    return {
      id: this.id,
      leaderId: this.leaderId,
      currentRoundNumber: this.currentRoundNumber,
      scoreboardShowing: this.scoreboardShowing,
      playerOrder: this.playerOrder.map((p) => ({ ...p })),
      completedRounds: this.rounds.map((r) => r.toResult()),
      currentRound: this._currentRound?.toState() ?? null,
    }
  }

  /**
   * Rebuild a game from persisted state, re-injecting live deps. Completed
   * rounds come back slim (points only); the current round in full. During a
   * round transition the just-finished round is BOTH the last completed round
   * and the current round — the same object is reused for both so identity
   * (and the scoreboard) stays correct. Call `resume()` afterwards to re-arm
   * any timer the crash dropped.
   */
  static fromState(state: GameState, deps: GameDeps): Game {
    const game = new Game(
      { id: state.id, leaderId: state.leaderId, players: state.playerOrder },
      deps,
    )
    game.currentRoundNumber = state.currentRoundNumber
    game.scoreboardShowing = state.scoreboardShowing

    const roster = new Map<string, RoundPlayerState>(
      state.playerOrder.map((p) => [p.id, { ...p, cards: [], bet: null, made: null, points: null }]),
    )
    const roundDeps: RoundDeps = {
      publisher: game.publisher,
      rng: game.rng,
      scheduler: game.scheduler,
      onComplete: () => game.handleRoundComplete(),
    }
    const noopDeps: RoundDeps = {
      publisher: { publish: () => {} },
      rng: game.rng,
      scheduler: { schedule: () => {} },
      onComplete: () => {},
    }

    const current = state.currentRound ? Round.fromState(state.currentRound, roundDeps) : null
    for (const result of state.completedRounds) {
      // Transition window: the last completed round IS the current round.
      if (current && result.roundNumber === current.roundNumber) {
        game.rounds.push(current)
      } else {
        game.rounds.push(Round.fromResult(result, roster, noopDeps))
      }
    }
    game._currentRound = current
    return game
  }

  /**
   * After `fromState`, re-arm whatever scheduled step the crash dropped: a
   * between-tricks pause, or a completed round's transition to the next deal /
   * game end. A game waiting on a human or bot move needs nothing — that move
   * arrives through the normal use-cases.
   */
  resume(): void {
    const round = this._currentRound
    if (!round) return
    if (round.isComplete) this.scheduleRoundTransition()
    else round.resume()
  }

  /** What `playerId` sees and may do right now (their hand, their bets).
   * Real card values — for tests / engine internals only. Bots and humans
   * must use `clientPerspective` so the blind round stays fair. */
  perspective(playerId: string): PlayerPerspective {
    return {
      playableCards: this.currentRound.getPlayableCards(playerId),
      availableBets: this.currentRound.getAvailableBets(playerId),
    }
  }

  /**
   * Human client view: on the blind round, own cards are `HIDDEN_CARD` and
   * `opponentHands` reveals everyone else's remaining cards.
   */
  clientPerspective(playerId: string): PlayerPerspective {
    const playableCards = this.currentRound.maskHandForClient(
      this.currentRound.getPlayableCards(playerId),
    )
    const availableBets = this.currentRound.getAvailableBets(playerId)
    if (!this.currentRound.isBlind) {
      return { playableCards, availableBets }
    }
    return {
      playableCards,
      availableBets,
      opponentHands: this.currentRound.opponentHandsFor(playerId),
    }
  }

  private startRound(): void {
    const roundPlayers: RoundPlayerState[] = this.playerOrder.map((player) => ({
      ...player,
      cards: [],
      bet: null,
      made: null,
      points: null,
    }))

    this._currentRound = new Round(
      { roundNumber: this.currentRoundNumber, players: roundPlayers },
      {
        publisher: this.publisher,
        rng: this.rng,
        scheduler: this.scheduler,
        onComplete: () => this.handleRoundComplete(),
      },
    )
    this._currentRound.start()
  }

  private handleRoundComplete(): void {
    this.rounds.push(this.currentRound)
    this.scheduleRoundTransition()
  }

  /**
   * Schedules the post-round work (game end, or the mid-game scoreboard plus
   * the next deal). Split out from `handleRoundComplete` so `resume()` can
   * re-arm it after a reload without re-pushing the round.
   */
  private scheduleRoundTransition(): void {
    if (this.currentRoundNumber === TOTAL_ROUNDS) {
      this.scheduler.schedule(() => {
        this.publisher.publish({ type: 'game-ended', scoreboard: this.scoreboard })
      }, this.roundTransitionDelay)
      return
    }

    if (this.currentRoundNumber === SCOREBOARD_ROUND) {
      this.scheduler.schedule(() => {
        this.scoreboardShowing = true
        this.publisher.publish({ type: 'scoreboard-shown', scoreboard: this.scoreboard })
      }, this.roundTransitionDelay)
    }

    this.scheduler.schedule(() => {
      this.currentRoundNumber++
      this.rotatePlayers()
      this.startRound()
    }, this.roundTransitionDelay)
  }

  /** The round's first bettor/leader advances one seat each round. */
  private rotatePlayers(): void {
    this.playerOrder.push(this.playerOrder.shift()!)
  }
}
