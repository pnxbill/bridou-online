import { TCards, TNumOfBet, TNumOfCards, TNumOfPlayers, TNumOfRounds, TPlayer, TRound } from '../../types'
import Deck from '../deck'
import { FIRST_ROUND_DESCENDING, MAX_CARDS } from '../constants'
import Utils from '../../utils'
import GameController from '../../controllers/GameController'
import app from '../../app'
import Turn from '../turn'

class Round implements TRound {
  players: TPlayer[]
  cardsForEachPlayer: TNumOfCards
  numOfPlayers: TNumOfPlayers
  trunfo: string
  cards: TCards
  numOfCards: number
  currentPlayerIndex: number
  currentRoundNumber: TNumOfRounds
  betting: boolean
  gameId: string
  whoMade: TPlayer[]
  bailadores: TPlayer[]
  turns: Turn[]
  currentTurn?: Turn

  constructor(id: string, currentRoundNumber: TRound['currentRoundNumber'], players: TPlayer[]) {
    this.players = players
    this.gameId = id
    this.betting = true
    this.trunfo = ''
    this.numOfPlayers = players.length as TNumOfPlayers
    this.currentRoundNumber = currentRoundNumber
    this.cardsForEachPlayer = (currentRoundNumber < FIRST_ROUND_DESCENDING ? currentRoundNumber : (MAX_CARDS - (currentRoundNumber - MAX_CARDS))) as TNumOfCards
    this.numOfCards = this.cardsForEachPlayer * this.numOfPlayers
    this.currentPlayerIndex = 0
    this.whoMade = []
    this.bailadores = []
    this.cards = []
    this.turns = []
    this.start()
  }

  private start() {
    const deck = new Deck()
    deck.shuffle()

    // After shuffling, remove excessive cards from the deck.
    this.cards = deck.cards.slice(0, this.numOfCards + 1)
    this.trunfo = this.cards.pop() || ''
    app.io.to(this.gameId).emit('set-trunfo', this.trunfo)
    this.assignCardsToPlayers(this.dealCards())
    this.sendBetSocket()
  }

  private assignCardsToPlayers(cards: TCards[]) {
    this.players = this.players.map((player, i) => ({ ...player, cards: cards[i] }))
  }

  private dealCards(): TCards[] {
    const playersCards: string[][] = Array.from({ length: this.numOfPlayers }, () => [])

    let player = 1
    for (let card = 1; card <= this.numOfCards; card++) {
      player = player === this.numOfPlayers ? 1 : player + 1
      playersCards[player - 1].push(this.cards[card - 1])
    }

    return playersCards
  }

  sendPlayCardSocket() {
    app.io.to(this.currentPlayer.socket).emit('play-time', this.getPlayableCards())
  }

  getPlayableCards(playerId?: TPlayer['id']) {
    if (!this.currentTurn || this.currentTurn.players[this.currentTurn.playedCards.length].id !== playerId) return this.players.find(p => p.id === playerId)?.cards?.map(c => ({value: c, disabled: true}))

    return this.currentTurn.getPlayableCards()
  }

  getAvailableBets(playerId?: TPlayer['id']) {
    if (!this.betting || (playerId && (this.currentPlayer.id !== playerId))) return []

    const isLastPlayer = this.players.at(-1)?.id === this.currentPlayer.id
    const availableBets = []
    const totalBets = this.players.slice(0, -1).reduce((acc, current) => acc + (current.bet || 0), 0)

    for (let i = 0; i <= this.cardsForEachPlayer; i++) {
      if (isLastPlayer && ((this.cardsForEachPlayer - totalBets) === i) && this.cardsForEachPlayer !== 1) continue
      availableBets.push(i)
    }

    return availableBets
  }

  sendBetSocket() {
    app.io.to(this.currentPlayer.socket).emit('bet-time', this.getAvailableBets())
  }

  addBetToPlayer(playerId: TPlayer['id'], bet: TNumOfBet) {
    if (!this.betting) throw new Error('Can\'t bet while still playing')

    this.checkIfPlayerTurn(playerId)
    this.checkIfValidBet(bet)
    this.players[this.currentPlayerIndex].bet = bet
    app.io.to(this.gameId).emit('player-bet', { id: this.currentPlayer.id, bet })
    global.log(this.players[this.currentPlayerIndex].name, 'bet', bet)(this.gameId)
    // @TODO: Send socket to update users' screens
    const lastPlayer = this.players.at(-1)?.id === playerId
    if (lastPlayer) {
      this.betting = false
      this.startTurn()
      return
    }
    this.currentPlayerIndex++
    this.sendBetSocket()
  }

  private checkIfValidBet(bet: TNumOfBet) {
    if (bet > this.cardsForEachPlayer) throw new Error('Can\'t bet this value')
    if (this.cardsForEachPlayer === 1) return
    if (this.currentPlayerIndex !== this.numOfPlayers - 1) return

    const totalBets = this.players.slice(0, -1).reduce((acc, current) => acc + current.bet, 0)
    if ((this.cardsForEachPlayer - totalBets) === bet) throw new Error('Can\'t bet this value')
  }

  get currentSuit() {
    if (this.betting || !this.currentTurn) return
    this.currentTurn.suit
  }

  get firstToPlay() {
    return this.whoMade.at(-1) || this.players[0]
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex]
  }

  private distributePoints() {
    this.players.forEach(pl => {
      const made = this.whoMade.filter(p => p.id === pl.id).length as TNumOfBet
      pl.points = pl.bet === made ? (10 + made) : -1
      pl.made = made
    })
    this.bailadores = this.players.filter(p => p.points === -1)
    global.log('Bailou: ', this.bailadores.map(b => b.name))(this.gameId)
  }


  private checkIfPlayerTurn(playerId: TPlayer['id']) {
    const playerIndex = this.players.findIndex(p => playerId === p.id)
    if (playerIndex !== this.currentPlayerIndex) {
      throw new Error('Not your turn')
    }
  }

  startTurn() {
    const turnPlayers = [...this.players]
    if (!turnPlayers.length) return

    while (turnPlayers[0].id !== this.firstToPlay.id) {
      turnPlayers.unshift(turnPlayers.pop() as TPlayer)
    }
    this.currentTurn = new Turn({ gameId: this.gameId, players: turnPlayers, trunfo: this.trunfo })
  }

  endTurn() {
    if (!this.currentTurn) throw new Error('No turn to end')
    this.turns.push(this.currentTurn)
    this.whoMade.push(this.currentTurn.winner)

    const isLastTurn = this.turns.length === this.cardsForEachPlayer
    if (isLastTurn) {
      this.distributePoints()
      GameController.games[this.gameId].endRound()
    } else {
      this.startTurn()
    }
  }
}

export default Round
