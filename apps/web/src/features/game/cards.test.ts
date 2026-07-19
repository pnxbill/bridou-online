import { HIDDEN_CARD } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { DEFAULT_HAND_ORDER } from '@/features/settings/hand-order'
import { orderHand, parseCard, sortHand, toLibCard, winningCardIndex } from './cards'

describe('parseCard', () => {
  it('maps engine card strings to rank + suit names', () => {
    expect(parseCard('A-♠️')).toEqual({ rank: 'A', suit: 'spades' })
    expect(parseCard('10-♥️')).toEqual({ rank: '10', suit: 'hearts' })
    expect(parseCard('2-♦️')).toEqual({ rank: '2', suit: 'diamonds' })
    expect(parseCard('Q-♣️')).toEqual({ rank: 'Q', suit: 'clubs' })
  })

  it('rejects unknown suits loudly', () => {
    expect(() => parseCard('A-🃏')).toThrow('Unknown card suit')
  })
})

describe('toLibCard', () => {
  it('keeps the engine value as the stable id and carries the disabled flag', () => {
    expect(toLibCard({ value: 'K-♥️', disabled: true })).toEqual({
      id: 'K-♥️',
      rank: 'K',
      suit: 'hearts',
      disabled: true,
      trump: false,
      variant: 'dark',
    })
  })

  it('accepts a deck face variant', () => {
    expect(toLibCard({ value: 'A-♠️', disabled: false }, 'light').variant).toBe('light')
  })

  it('flags cards of the trump suit', () => {
    expect(toLibCard({ value: 'K-♥️', disabled: false }, 'dark', 'hearts').trump).toBe(true)
    expect(toLibCard({ value: 'K-♠️', disabled: false }, 'dark', 'hearts').trump).toBe(false)
  })
})

describe('winningCardIndex', () => {
  const trunfo = '7-♦️'

  it('is -1 for an empty table', () => {
    expect(winningCardIndex([], trunfo)).toBe(-1)
  })

  it('is the highest card of the led suit when no trunfo was played', () => {
    expect(winningCardIndex(['5-♠️', 'K-♠️', 'A-♥️'], trunfo)).toBe(1)
  })

  it('any trunfo beats the led suit; the highest trunfo wins', () => {
    expect(winningCardIndex(['A-♠️', '3-♦️'], trunfo)).toBe(1)
    expect(winningCardIndex(['4-♦️', 'J-♦️', 'A-♠️'], trunfo)).toBe(1)
  })

  it('the leader wins until someone beats them', () => {
    expect(winningCardIndex(['Q-♣️'], trunfo)).toBe(0)
    expect(winningCardIndex(['Q-♣️', '2-♣️'], trunfo)).toBe(0)
  })
})

describe('sortHand', () => {
  const hand = (...values: string[]) => values.map((value) => ({ value, disabled: false }))
  const values = (cards: Array<{ value: string }>) => cards.map((c) => c.value)
  const trunfo = '7-♦️'
  const prefs = (overrides: Partial<typeof DEFAULT_HAND_ORDER>) => ({
    ...DEFAULT_HAND_ORDER,
    ...overrides,
  })

  const dealt = hand('K-♠️', '2-♥️', '4-♦️', 'A-♠️', 'Q-♥️', '3-♠️')

  it('keeps the dealt order when every toggle is off (the default)', () => {
    expect(sortHand(dealt, DEFAULT_HAND_ORDER, trunfo)).toBe(dealt)
  })

  it('groups suits in their first-appearance order', () => {
    expect(values(sortHand(dealt, prefs({ bySuit: true }), trunfo))).toEqual([
      'K-♠️',
      'A-♠️',
      '3-♠️',
      '2-♥️',
      'Q-♥️',
      '4-♦️',
    ])
  })

  it('orders weakest → strongest across suits', () => {
    expect(values(sortHand(hand('K-♠️', '2-♥️', 'A-♦️', '4-♣️'), prefs({ byStrength: true }), trunfo))).toEqual([
      '2-♥️',
      '4-♣️',
      'K-♠️',
      'A-♦️',
    ])
  })

  it('pushes trumps to the end, keeping dealt order otherwise', () => {
    expect(values(sortHand(dealt, prefs({ trumpsLast: true }), trunfo))).toEqual([
      'K-♠️',
      '2-♥️',
      'A-♠️',
      'Q-♥️',
      '3-♠️',
      '4-♦️',
    ])
  })

  it('combines all three: suit groups, strength inside them, trumps last', () => {
    const cards = hand('K-♠️', '2-♥️', '4-♦️', 'A-♠️', 'Q-♥️', '2-♦️')
    expect(
      values(sortHand(cards, prefs({ bySuit: true, byStrength: true, trumpsLast: true }), trunfo)),
    ).toEqual(['K-♠️', 'A-♠️', '2-♥️', 'Q-♥️', '2-♦️', '4-♦️'])
  })

  it('leaves a blind-round hidden hand alone', () => {
    const blind = [{ value: HIDDEN_CARD, disabled: false }]
    expect(sortHand(blind, prefs({ bySuit: true, byStrength: true }), trunfo)).toBe(blind)
  })
})

describe('orderHand', () => {
  const hand = (...values: string[]) => values.map((value) => ({ value, disabled: false }))

  it('keeps server order when the player never rearranged', () => {
    expect(orderHand(hand('a', 'b', 'c'), []).map((c) => c.value)).toEqual(['a', 'b', 'c'])
  })

  it('applies the player arrangement to the cards still in hand', () => {
    expect(orderHand(hand('a', 'b', 'c'), ['c', 'a', 'b']).map((c) => c.value)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('drops played cards and appends newly dealt ones', () => {
    // player arranged c-a-b; then b was played and d,e were dealt
    expect(orderHand(hand('a', 'c', 'd', 'e'), ['c', 'a', 'b']).map((c) => c.value)).toEqual([
      'c',
      'a',
      'd',
      'e',
    ])
  })

  it('preserves updated card state (disabled flags come from the server)', () => {
    const cards = [
      { value: 'a', disabled: true },
      { value: 'b', disabled: false },
    ]
    expect(orderHand(cards, ['b', 'a'])).toEqual([
      { value: 'b', disabled: false },
      { value: 'a', disabled: true },
    ])
  })
})
