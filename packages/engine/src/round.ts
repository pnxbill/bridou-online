import {
  MAX_CARDS_PER_PLAYER,
  type Card,
  type EventPublisher,
  type HandCard,
  type RoundSnapshot,
} from '@bridou/shared'
import { createDeck, shuffle } from './deck'
import { GameError } from './errors'
import { toRoundPlayer, type RoundPlayerState } from './player'
import type { Rng, Scheduler } from './ports'
import { Turn } from './turn'

/** Completed tricks stay on the table this long before the next one starts. */
export const TRICK_RESOLUTION_MS = 1500

export interface RoundDeps {
  publisher: EventPublisher
  rng: Rng
  scheduler: Scheduler
  /** Called once, after points are distributed for the last trick. */
  onComplete: () => void
}

/** Rounds 1..7 deal 1..7 cards; rounds 8..13 deal 6..1. */
export const cardsForRound = (roundNumber: number): number =>
  roundNumber <= MAX_CARDS_PER_PLAYER ? roundNumber : 2 * MAX_CARDS_PER_PLAYER - roundNumber

export class Round {
  readonly roundNumber: number
  readonly cardsForEachPlayer: number
  /** Betting order. The player at `currentPlayerIndex` bets next while `betting`. */
  readonly players: RoundPlayerState[]
  trunfo: Card = ''
  betting = true
  currentPlayerIndex = 0
  turns: Turn[] = []
  currentTurn: Turn | null = null
  /** Winner of each completed trick, in order. */
  whoMade: RoundPlayerState[] = []
  bailadores: RoundPlayerState[] = []

  private readonly deps: RoundDeps

  constructor(
    { roundNumber, players }: { roundNumber: number; players: RoundPlayerState[] },
    deps: RoundDeps,
  ) {
    this.roundNumber = roundNumber
    this.cardsForEachPlayer = cardsForRound(roundNumber)
    this.players = players
    this.deps = deps
  }

  /** Shuffles, deals, reveals the trunfo and asks the first player for a bet. */
  start(): void {
    const deck = shuffle(createDeck(), this.deps.rng)
    const numOfCards = this.cardsForEachPlayer * this.players.length

    this.players.forEach((player) => (player.cards = []))
    for (let i = 0; i < numOfCards; i++) {
      this.players[i % this.players.length]!.cards.push(deck[i]!)
    }
    this.trunfo = deck[numOfCards]!

    const { publisher } = this.deps
    publisher.publish({ type: 'round-started', round: this.snapshot() })
    publisher.publish({ type: 'trunfo-set', trunfo: this.trunfo })
    this.players.forEach((player) => {
      publisher.publish({ type: 'cards-dealt', playerId: player.id, cards: [...player.cards] })
    })
    publisher.publish({
      type: 'bet-requested',
      playerId: this.currentPlayer.id,
      availableBets: this.getAvailableBets(this.currentPlayer.id),
    })
  }

  get currentPlayer(): RoundPlayerState {
    const player = this.players[this.currentPlayerIndex]
    if (!player) throw new GameError('No current player')
    return player
  }

  /** Last trick's winner leads the next one; the first player leads trick one. */
  get firstToPlay(): RoundPlayerState {
    return this.whoMade.at(-1) ?? this.players[0]!
  }

  placeBet(playerId: string, bet: number): void {
    if (!this.betting) throw new GameError("Can't bet while still playing")
    if (this.currentPlayer.id !== playerId) throw new GameError('Not your turn')
    this.checkIfValidBet(bet)

    this.currentPlayer.bet = bet
    this.deps.publisher.publish({ type: 'player-bet', playerId, bet })

    const isLastPlayer = this.players.at(-1)?.id === playerId
    if (isLastPlayer) {
      this.betting = false
      this.startTurn()
      return
    }
    this.currentPlayerIndex++
    this.deps.publisher.publish({
      type: 'bet-requested',
      playerId: this.currentPlayer.id,
      availableBets: this.getAvailableBets(this.currentPlayer.id),
    })
  }

  playCard(playerId: string, card: Card): void {
    if (!this.currentTurn) throw new GameError('No turn in progress')
    const turn = this.currentTurn

    turn.playCard(playerId, card)
    this.deps.publisher.publish({
      type: 'card-played',
      playerId,
      card,
      playedCards: [...turn.playedCards],
    })

    if (turn.isComplete) this.endTurn(turn)
    else this.requestPlay(turn)
  }

  /**
   * Bets a player may place right now. The last bettor cannot make the bets
   * sum to the number of cards (someone must fail) — except in 1-card rounds.
   */
  getAvailableBets(playerId?: string): number[] {
    if (!this.betting || (playerId && this.currentPlayer.id !== playerId)) return []

    const isLastPlayer = this.players.at(-1)?.id === this.currentPlayer.id
    const totalBets = this.players.slice(0, -1).reduce((acc, p) => acc + (p.bet ?? 0), 0)
    const forbidden = this.cardsForEachPlayer - totalBets

    const availableBets: number[] = []
    for (let bet = 0; bet <= this.cardsForEachPlayer; bet++) {
      if (isLastPlayer && bet === forbidden && this.cardsForEachPlayer !== 1) continue
      availableBets.push(bet)
    }
    return availableBets
  }

  /**
   * The given player's hand with unplayable cards disabled. Outside their
   * turn (or while betting) the whole hand is disabled — this is also how a
   * reconnecting client recovers its cards.
   */
  getPlayableCards(playerId: string): HandCard[] {
    const isCurrentTurnPlayer =
      this.currentTurn && !this.currentTurn.isComplete && this.currentTurn.currentPlayer.id === playerId
    if (!isCurrentTurnPlayer) {
      const player = this.players.find((p) => p.id === playerId)
      return player?.cards.map((value) => ({ value, disabled: true })) ?? []
    }
    return this.currentTurn!.getPlayableCards(playerId)
  }

  snapshot(): RoundSnapshot {
    return {
      currentRoundNumber: this.roundNumber,
      cardsForEachPlayer: this.cardsForEachPlayer,
      numOfPlayers: this.players.length,
      trunfo: this.trunfo,
      players: this.players.map(toRoundPlayer),
      betting: this.betting,
      turns: this.turns.map((t) => t.snapshot()),
      currentTurn: this.currentTurn?.snapshot() ?? null,
      whoMade: this.whoMade.map(toRoundPlayer),
      bailadores: this.bailadores.map(toRoundPlayer),
    }
  }

  private startTurn(): void {
    const turnPlayers = [...this.players]
    while (turnPlayers[0]!.id !== this.firstToPlay.id) {
      turnPlayers.unshift(turnPlayers.pop()!)
    }
    const turn = new Turn({ players: turnPlayers, trunfo: this.trunfo })
    this.currentTurn = turn
    this.deps.publisher.publish({ type: 'turn-started', turn: turn.snapshot() })
    this.requestPlay(turn)
  }

  private requestPlay(turn: Turn): void {
    this.deps.publisher.publish({
      type: 'play-requested',
      playerId: turn.currentPlayer.id,
      cards: turn.getPlayableCards(),
    })
  }

  private endTurn(turn: Turn): void {
    this.turns.push(turn)
    const winner = turn.winner
    this.whoMade.push(winner)
    this.deps.publisher.publish({ type: 'turn-ended', turn: turn.snapshot(), winnerId: winner.id })

    const isLastTurn = this.turns.length === this.cardsForEachPlayer
    if (isLastTurn) {
      this.distributePoints()
      this.deps.publisher.publish({
        type: 'round-ended',
        bailadores: this.bailadores.map(toRoundPlayer),
      })
      this.deps.onComplete()
    } else {
      // Let everyone see the completed trick before the next one starts
      this.deps.scheduler.schedule(() => this.startTurn(), TRICK_RESOLUTION_MS)
    }
  }

  /** Exact bet made: 10 + tricks taken. Missed: -1 (a "bailador"). */
  private distributePoints(): void {
    this.players.forEach((player) => {
      const made = this.whoMade.filter((w) => w.id === player.id).length
      player.made = made
      player.points = player.bet === made ? 10 + made : -1
    })
    this.bailadores = this.players.filter((p) => p.points === -1)
  }

  private checkIfValidBet(bet: number): void {
    if (!Number.isInteger(bet) || bet < 0 || bet > this.cardsForEachPlayer) {
      throw new GameError("Can't bet this value")
    }
    if (this.cardsForEachPlayer === 1) return

    const isLastPlayer = this.currentPlayerIndex === this.players.length - 1
    if (!isLastPlayer) return

    const totalBets = this.players.slice(0, -1).reduce((acc, p) => acc + (p.bet ?? 0), 0)
    if (this.cardsForEachPlayer - totalBets === bet) throw new GameError("Can't bet this value")
  }
}
