import { TCards, TNumOfBet, TNumOfCards, TNumOfPlayers, TNumOfRounds, TPlayer, TRound } from '../../types'
import Deck from '../deck'
import { FIRST_ROUND_DESCENDING, MAX_CARDS } from '../constants'
import Utils from '../../utils'
import GameController from '../../controllers/GameController'
import app from '../../app'

class Round implements TRound {
  players: TPlayer[]
  cardsForEachPlayer: TNumOfCards
  numOfPlayers: TNumOfPlayers
  trunfo: string
  cards: TCards
  numOfCards: number
  playedCards: TCards[]
  currentPlayerIndex: number
  currentRoundNumber: TNumOfRounds
  betting: boolean
  gameId: string
  whoMade: TPlayer[]
  bailadores: TPlayer[]

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
    this.playedCards = Array.from({ length: this.numOfPlayers }, () => [])
    this.whoMade = []
    this.bailadores = []
    this.cards = []
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
    const playersCards = Array.from({ length: this.numOfPlayers }, () => [])

    let player = 1
    for (let card = 1; card <= this.numOfCards; card++) {
      player = player === this.numOfPlayers ? 1 : player + 1
      playersCards[player - 1].push(this.cards[card - 1])
    }

    return playersCards
  }

  private setCardStatus(value: string, disabled: boolean) {
    return { value, disabled }
  }

  sendPlayCardSocket() {
    app.io.to(this.currentPlayer.socket).emit('play-time', this.getPlayableCards())
  }

  getPlayableCards(playerId?: TPlayer['id']) {
    let playableCards: TCards = []
    if (playerId && ((this.currentPlayer.id !== playerId) || this.betting)) {
      return this.players.find(p => p.id === playerId)?.cards.map(c => this.setCardStatus(c, true))
    }

    if (this.firstToPlay.id === this.currentPlayer.id) {
      playableCards = this.currentPlayer.cards || []
    } else {
      playableCards = this.currentPlayer.cards?.filter(c => c.split('-')[1] === this.currentSuit) || []
      if (playableCards.length === 0 || this.cardsForEachPlayer === 1) playableCards = this.currentPlayer.cards || []
    }
    const cards = this.currentPlayer.cards?.map(c => this.setCardStatus(c, !playableCards.includes(c)))
    return cards
  }

  sendBetSocket() {
    const isLastPlayer = this.players.at(-1)?.id === this.currentPlayer.id
    const availableBets = []
    const totalBets = this.players.slice(0, -1).reduce((acc, current) => acc + (current.bet || 0), 0)

    for (let i = 0; i <= this.cardsForEachPlayer; i++) {
      if (isLastPlayer && ((this.cardsForEachPlayer - totalBets) === i) && this.cardsForEachPlayer !== 1) continue
      availableBets.push(i)
    }

    app.io.to(this.currentPlayer.socket).emit('bet-time', availableBets)
  }

  playCard(playerId: TPlayer['id'], card: string) {
    if (this.betting) throw new Error('Can\'t play card while betting')
    this.checkIfPlayerTurn(playerId)
    this.checkIfPlayerHasCard(playerId, card)
    this.checkIfCorrectSuit(playerId, card)
    // Remove card from players hand
    const cardIndex = this.players[this.currentPlayerIndex].cards.indexOf(card)
    this.players[this.currentPlayerIndex].cards.splice(cardIndex, 1)
    // Add card to table
    this.playedCards[this.currentPlayerIndex].push(card)
    global.log(`${this.players.find(pl => pl.id === playerId).name} played: ${card}`)(this.gameId)
    this.updatePlayerIndex()
    if (!this.hasAllCardsBeenPlayed) this.sendPlayCardSocket()
  }

  addBetToPlayer(playerId: TPlayer['id'], bet: TNumOfBet) {
    if (!this.betting) throw new Error('Can\'t bet while still playing')

    this.checkIfPlayerTurn(playerId)
    this.checkIfValidBet(bet)
    this.players[this.currentPlayerIndex].bet = bet
    global.log(this.players[this.currentPlayerIndex].name, 'bet', bet)(this.gameId)
    // @TODO: Send socket to update users' screens
    const lastPlayer = this.players.at(-1)?.id === playerId
    this.updatePlayerIndex()
    if (!lastPlayer) this.sendBetSocket()
  }

  private checkIfValidBet(bet: TNumOfBet) {
    if (bet > this.cardsForEachPlayer) throw new Error('Can\'t bet this value')
    if (this.cardsForEachPlayer === 1) return
    if (this.currentPlayerIndex !== this.numOfPlayers - 1) return

    const totalBets = this.players.slice(0, -1).reduce((acc, current) => acc + current.bet, 0)
    if ((this.cardsForEachPlayer - totalBets) === bet) throw new Error('Can\'t bet this value')
  }

  private checkIfCorrectSuit(playerId, card) {
    // First to play can play any card
    if (this.firstToPlay.id === playerId) return
    const cardSuit = card.split('-')[1]
    // If card is the same suit as current suit, we let it pass
    if (cardSuit === this.currentSuit) return

    const playerCards = this.players.find(p => p.id === playerId).cards.map(c => c.split('-')[1])
    if (playerCards.includes(this.currentSuit)) throw new Error('If you have a card with the current suit, you must play it')
  }

  get currentSuit() {
    if (this.betting) return
    const playerIdx = this.players.findIndex(p => p.id === this.firstToPlay.id)
    return this.roundCards[playerIdx]?.split('-')[1]
  }

  get firstToPlay() {
    return this.whoMade.at(-1) || this.players[0]
  }

  get roundCards() {
    if (this.betting) return
    return this.playedCards.map(c => c.at(-1))
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex]
  }

  private getWhoMade(): TPlayer {
    const trunfoSuit = this.trunfo.split('-')[1]
    const trunfosInRound = this.roundCards.filter(c => c.includes(trunfoSuit)).map(c => Utils.getCardValue(c.split('-')[0]))

    // Decide which card is the biggest
    let winnerCard
    // If there is trunfos, just pick the biggest one
    if (trunfosInRound.length) {
      winnerCard = Utils.getCardName(Math.max(...trunfosInRound)) + '-' + trunfoSuit
    } else {
      // In case there isn't any, get the first card suit and pick the biggest of this suit
      const playableCards = this.roundCards.filter(card => card.includes(this.currentSuit)).map(c => Utils.getCardValue(c.split('-')[0]))
      winnerCard = Utils.getCardName(Math.max(...playableCards)) + '-' + this.currentSuit
    }

    const winnerIndex = this.roundCards.findIndex(c => c === winnerCard)
    global.log('>>>', this.players[winnerIndex].name, 'made with:', winnerCard, '<<<', '\n')(this.gameId)

    return this.players[winnerIndex]
  }

  private updatePlayerIndex() {
    let lastPlayer = this.currentPlayerIndex === (this.numOfPlayers - 1)
    if (this.whoMade.length) {
      const idx = this.players.findIndex(pl => this.whoMade.at(-1).id === pl.id)
      const lastPlayerIdx = idx === 0 ? (this.numOfPlayers - 1) : (idx - 1)
      lastPlayer = this.currentPlayerIndex === lastPlayerIdx
    }

    if (lastPlayer) {
      if (!this.betting) {
        const playerWhoMade = this.getWhoMade()
        this.whoMade.push(playerWhoMade)
        const nextPlayerIdx = this.players.findIndex(pl => pl.id === playerWhoMade.id)
        this.currentPlayerIndex = nextPlayerIdx
      } else {
        this.currentPlayerIndex = 0
      }

      if (this.hasAllCardsBeenPlayed) {
        this.distributePoints()
        return GameController.games[this.gameId].endRound()
      }

      if (this.betting) {
        global.log('')(this.gameId)
        this.betting = false
        this.sendPlayCardSocket()
      }
      global.log(`[${this.whoMade.length + 1}/${this.cardsForEachPlayer}]`)(this.gameId)
      return
    }

    this.currentPlayerIndex = this.currentPlayerIndex === (this.numOfPlayers - 1) ? 0 : (this.currentPlayerIndex + 1)
  }

  get hasAllCardsBeenPlayed() {
    return this.playedCards.reduce((acc, current) => acc + current.length, 0) === this.numOfCards
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

  private cleanBets() {
    this.players.forEach(player => { player.bet = null })
  }

  private checkIfPlayerTurn(playerId: TPlayer['id']) {
    const playerIndex = this.players.findIndex(p => playerId === p.id)
    if (playerIndex !== this.currentPlayerIndex) {
      throw new Error('Not your turn')
    }
  }

  private checkIfPlayerHasCard(playerId: TPlayer['id'], card: string) {
    const player = this.players.find(player => player.id === playerId)
    if (!player.cards.includes(card)) throw new Error(`Player ${player.name} doesn't have the card: ${card}`)
  }
}

export default Round
