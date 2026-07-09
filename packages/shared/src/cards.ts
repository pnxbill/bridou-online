/**
 * A card is encoded as `${rank}-${suit}`, e.g. "A-♠️" or "10-♥️".
 * This matches the SVG asset filenames under public/cards.
 */
export type Card = string

export const SUITS = ['♦️', '♠️', '♥️', '♣️'] as const
export type Suit = (typeof SUITS)[number]

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export type Rank = (typeof RANKS)[number]

export const cardRank = (card: Card): string => card.split('-')[0] ?? ''
export const cardSuit = (card: Card): string => card.split('-')[1] ?? ''

const FACE_VALUES: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 }

/** Numeric strength of a card's rank (2..14). */
export const rankValue = (card: Card): number => {
  const rank = cardRank(card)
  return FACE_VALUES[rank] ?? Number(rank)
}

/** A card in a player's hand, flagged with whether it may be played right now. */
export interface HandCard {
  value: Card
  disabled: boolean
}
