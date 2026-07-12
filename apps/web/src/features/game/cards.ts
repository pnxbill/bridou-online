import type { HandCard as LibHandCard, Rank, Suit } from '@bridou/cards-ui'
import { HIDDEN_CARD, cardRank, cardSuit, rankValue, type Card, type HandCard } from '@bridou/shared'

/** Engine cards are `"A-♠️"` strings; the card components want rank + suit names. */
const SUIT_BY_EMOJI: Record<string, Suit> = {
  '♥️': 'hearts',
  '♦️': 'diamonds',
  '♣️': 'clubs',
  '♠️': 'spades',
}

export interface CardParts {
  rank: Rank
  suit: Suit
}

export const parseCard = (card: Card): CardParts => {
  const suit = SUIT_BY_EMOJI[cardSuit(card)]
  if (!suit) throw new Error(`Unknown card suit: ${card}`)
  return { rank: cardRank(card) as Rank, suit }
}

export const toLibCard = (
  card: HandCard,
  variant: LibHandCard['variant'] = 'dark',
): LibHandCard => {
  if (card.value === HIDDEN_CARD) {
    return {
      id: HIDDEN_CARD,
      rank: 'A',
      suit: 'spades',
      faceUp: false,
      disabled: card.disabled,
      variant,
    }
  }
  return {
    id: card.value,
    ...parseCard(card.value),
    disabled: card.disabled,
    variant,
  }
}

const beats = (challenger: Card, incumbent: Card, ledSuit: string, trunfoSuit: string): boolean => {
  const cSuit = cardSuit(challenger)
  const iSuit = cardSuit(incumbent)
  if (cSuit === trunfoSuit && iSuit !== trunfoSuit) return true
  if (cSuit !== trunfoSuit && iSuit === trunfoSuit) return false
  if (cSuit === iSuit) return rankValue(challenger) > rankValue(incumbent)
  return cSuit === ledSuit && iSuit !== ledSuit
}

/**
 * Which card on the table is currently taking the trick (highest trunfo,
 * else highest of the led suit). -1 for an empty table. Presentation only —
 * the engine still decides the real winner.
 */
export const winningCardIndex = (playedCards: Card[], trunfo: Card): number => {
  if (!playedCards.length) return -1
  const trunfoSuit = cardSuit(trunfo)
  const ledSuit = cardSuit(playedCards[0]!)
  let best = 0
  for (let i = 1; i < playedCards.length; i++) {
    if (beats(playedCards[i]!, playedCards[best]!, ledSuit, trunfoSuit)) best = i
  }
  return best
}

/**
 * Applies the player's local arrangement to the server's hand: cards they
 * have dragged keep their chosen positions, anything new keeps server order.
 * The server never knows about hand order — it's pure presentation.
 */
export const orderHand = (cards: HandCard[], order: string[]): HandCard[] => {
  const byValue = new Map(cards.map((c) => [c.value, c]))
  const arranged = order.map((value) => byValue.get(value)).filter((c): c is HandCard => !!c)
  const rest = cards.filter((c) => !order.includes(c.value))
  return [...arranged, ...rest]
}
