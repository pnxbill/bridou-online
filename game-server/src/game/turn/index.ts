import { TPlayer, TTurn } from '../../types'
import Utils from '../../utils'

import app from '../../app'
import GameController from '../../controllers/GameController'

class Turn implements TTurn {
  gameId: string
  players: TPlayer[]
  suit: string
  playedCards: string[]
  trunfo: string

  constructor({ gameId, players, trunfo }: { gameId: string, players: TPlayer[], trunfo: string }) {
    this.gameId = gameId
    this.players = players
    this.playedCards = []
    this.trunfo = trunfo
    this.suit = ''
    this.sendTurnStartedSocket()
    this.sendPlayCardSocket()
  }

  sendTurnStartedSocket() {
    app.io.to(this.gameId).emit('turn-started', this)
  }

  sendPlayCardSocket() {
    app.io.to(this.players[this.playedCards.length].socket).emit('play-time', this.getPlayableCards())
  }

  playCard(playerId: TPlayer['id'], card: string) {
    // Run checks to see if player has the right to play. If any of these checks throws
    // an error, the play will be halted.
    this.checkIfPlayerTurn(playerId)
    this.checkIfPlayerHasCard(playerId, card)
    this.checkIfCorrectSuit(playerId, card)

    // Remove card from players hand
    const cardIndex = this.players[this.playedCards.length].cards.indexOf(card)
    this.players[this.playedCards.length].cards.splice(cardIndex, 1)

    // Add card to table
    this.playedCards.push(card)

    // Inform the clients about the play
    app.io.to(this.gameId).emit('player-play', this.playedCards)

    const lastToPlay = this.playedCards.length === this.players.length
    if (lastToPlay) this.currentRound.endTurn()
    else this.sendPlayCardSocket()
  }

  get currentRound() {
    return GameController.games[this.gameId].currentRound
  }

  private checkIfPlayerTurn(playerId: TPlayer['id']) {
    const playerIndex = this.players.findIndex(p => playerId === p.id)
    if (playerIndex !== this.playedCards.length) {
      throw new Error('Not your turn')
    }
  }

  private checkIfPlayerHasCard(playerId: TPlayer['id'], card: string) {
    const player = this.players.find(player => player.id === playerId) as TPlayer
    if (!player.cards.includes(card)) throw new Error(`Player ${player.name} doesn't have the card: ${card}`)
  }

  private checkIfCorrectSuit(playerId: TPlayer['id'], card: string) {
    const cardSuit = card.split('-')[1]
    // First to play can play any card
    if (this.players[0].id === playerId) {
      this.suit = cardSuit
      return
    }
    
    // If card is the same suit as current suit, we let it pass
    if (cardSuit === this.suit) return

    const playerCards = (this.players.find(p => p.id === playerId) as TPlayer).cards.map((c: string) => c.split('-')[1])
    if (playerCards.includes(this.suit)) throw new Error('If you have a card with the current suit, you must play it')
  }

  get winner() {
    return this.getWhoMade()
  }

  private getWhoMade(): TPlayer {
    const trunfoSuit = this.trunfo.split('-')[1]
    const trunfosInRound = this.playedCards.filter(c => c.includes(trunfoSuit)).map(c => Utils.getCardValue(c.split('-')[0]))

    // Decide which card is the biggest
    let winnerCard: string
    // If there is trunfos, just pick the biggest one
    if (trunfosInRound.length) {
      winnerCard = Utils.getCardName(Math.max(...trunfosInRound)) + '-' + trunfoSuit
    } else {
      // In case there isn't any, get the first card suit and pick the biggest of this suit
      const playableCards = this.playedCards.filter(card => card.includes(this.suit)).map(c => Utils.getCardValue(c.split('-')[0]))
      winnerCard = Utils.getCardName(Math.max(...playableCards)) + '-' + this.suit
    }

    const winnerIndex = this.playedCards.findIndex(c => c === winnerCard)
    global.log('>>>', this.players[winnerIndex].name, 'made with:', winnerCard, '<<<', '\n')(this.gameId)

    return this.players[winnerIndex]
  }

  setCardStatus(value: string, disabled: boolean) {
    return { value, disabled }
  }

  getPlayableCards(playerId?: string) {
    const player = this.players.find(p => p.id === playerId) || this.players[this.playedCards.length]
    const isCurrentPlayer = player.id === this.players[this.playedCards.length].id
    if (!isCurrentPlayer) return player.cards?.map(c => this.setCardStatus(c, true))
    // First player can play any card
    let sameSuitCards = player.cards?.filter(card => card.split('-')[1] === this.suit)
    if (!this.playedCards.length || !sameSuitCards?.length) return player.cards?.map(c => this.setCardStatus(c, false))

    return player.cards?.map(c => this.setCardStatus(c, !sameSuitCards?.includes(c)))
  }
}

export default Turn
