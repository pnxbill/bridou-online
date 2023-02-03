import { TCards } from '../../types'
import { cards, suits } from './data.json'

class Deck {
  cards: TCards

  constructor() {
    this.cards = []
    this.createDeck()
  }

  private createDeck() {
    suits.forEach(suit => {
      this.cards = this.cards.concat(cards.map(card => `${card}-${suit}`))
    })
  }

  shuffle() {
    this.cards = this.cards.sort(function () {
      return Math.random() - 0.5
    })
  }
}

export default Deck
