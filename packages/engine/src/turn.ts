import { cardSuit, rankValue, type Card, type HandCard, type TurnSnapshot } from '@bridou/shared'
import { GameError } from './errors'
import { toRoundPlayer, type RoundPlayerState } from './player'

/**
 * One trick. Players are in play order: the player at index
 * `playedCards.length` is the one who acts next.
 */
export class Turn {
  readonly players: RoundPlayerState[]
  readonly trunfo: Card
  suit = ''
  playedCards: Card[] = []

  constructor({ players, trunfo }: { players: RoundPlayerState[]; trunfo: Card }) {
    this.players = players
    this.trunfo = trunfo
  }

  get currentPlayer(): RoundPlayerState {
    const player = this.players[this.playedCards.length]
    if (!player) throw new GameError('Turn is already complete')
    return player
  }

  get isComplete(): boolean {
    return this.playedCards.length === this.players.length
  }

  playCard(playerId: string, card: Card): void {
    this.checkIfPlayerTurn(playerId)
    this.checkIfPlayerHasCard(playerId, card)
    this.checkIfCorrectSuit(playerId, card)

    const player = this.currentPlayer
    player.cards.splice(player.cards.indexOf(card), 1)
    this.playedCards.push(card)
  }

  /** Winner of the trick: highest trunfo if any was played, else highest of the led suit. */
  get winner(): RoundPlayerState {
    if (!this.isComplete) throw new GameError('Turn is not complete yet')

    const trunfoSuit = cardSuit(this.trunfo)
    const candidates = this.playedCards.some((c) => cardSuit(c) === trunfoSuit)
      ? this.playedCards.map((c, i) => ({ card: c, i })).filter(({ card }) => cardSuit(card) === trunfoSuit)
      : this.playedCards.map((c, i) => ({ card: c, i })).filter(({ card }) => cardSuit(card) === this.suit)

    const best = candidates.reduce((a, b) => (rankValue(b.card) > rankValue(a.card) ? b : a))
    const winner = this.players[best.i]
    if (!winner) throw new GameError('Could not determine turn winner')
    return winner
  }

  /**
   * The given player's hand, with cards they may not play right now disabled.
   * Defaults to the current player. Not-your-turn means everything disabled.
   */
  getPlayableCards(playerId?: string): HandCard[] {
    const player = playerId
      ? this.players.find((p) => p.id === playerId)
      : this.players[this.playedCards.length]
    if (!player) return []

    if (this.isComplete || player.id !== this.currentPlayer.id) {
      return player.cards.map((value) => ({ value, disabled: true }))
    }

    const sameSuitCards = player.cards.filter((card) => cardSuit(card) === this.suit)
    // Leading the trick, or void in the led suit: anything goes
    if (!this.playedCards.length || !sameSuitCards.length) {
      return player.cards.map((value) => ({ value, disabled: false }))
    }
    return player.cards.map((value) => ({ value, disabled: !sameSuitCards.includes(value) }))
  }

  snapshot(): TurnSnapshot {
    return {
      players: this.players.map(toRoundPlayer),
      suit: this.suit || null,
      playedCards: [...this.playedCards],
      trunfo: this.trunfo,
    }
  }

  private checkIfPlayerTurn(playerId: string): void {
    if (this.isComplete || this.currentPlayer.id !== playerId) {
      throw new GameError('Not your turn')
    }
  }

  private checkIfPlayerHasCard(playerId: string, card: Card): void {
    const player = this.players.find((p) => p.id === playerId)
    if (!player?.cards.includes(card)) {
      throw new GameError(`Player ${player?.name ?? playerId} doesn't have the card: ${card}`)
    }
  }

  private checkIfCorrectSuit(playerId: string, card: Card): void {
    // First to play sets the suit and can play any card
    if (this.playedCards.length === 0) {
      this.suit = cardSuit(card)
      return
    }
    if (cardSuit(card) === this.suit) return

    const player = this.players.find((p) => p.id === playerId)
    const hasLedSuit = player?.cards.some((c) => cardSuit(c) === this.suit)
    if (hasLedSuit) {
      throw new GameError('If you have a card with the current suit, you must play it')
    }
  }
}
