import { RANKS, SUITS, type Card } from '@bridou/shared'
import type { Rng } from './ports'

export const createDeck = (): Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}-${suit}`))

/** Fisher–Yates. Returns a new array; does not mutate the input. */
export const shuffle = (cards: readonly Card[], rng: Rng): Card[] => {
  const result = [...cards]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}
