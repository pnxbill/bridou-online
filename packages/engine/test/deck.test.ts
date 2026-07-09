import { describe, expect, it } from 'vitest'
import { createDeck, shuffle } from '../src/deck'
import { seededRng } from './helpers'

describe('createDeck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck).size).toBe(52)
  })

  it('encodes cards as rank-suit matching the asset naming', () => {
    const deck = createDeck()
    expect(deck).toContain('A-♠️')
    expect(deck).toContain('10-♥️')
    expect(deck).toContain('2-♦️')
  })
})

describe('shuffle', () => {
  it('is a permutation of the input', () => {
    const deck = createDeck()
    const shuffled = shuffle(deck, seededRng(1))
    expect([...shuffled].sort()).toEqual([...deck].sort())
  })

  it('does not mutate the input', () => {
    const deck = createDeck()
    const copy = [...deck]
    shuffle(deck, seededRng(1))
    expect(deck).toEqual(copy)
  })

  it('is deterministic for a given seed', () => {
    expect(shuffle(createDeck(), seededRng(42))).toEqual(shuffle(createDeck(), seededRng(42)))
  })

  it('produces different orders for different seeds', () => {
    expect(shuffle(createDeck(), seededRng(1))).not.toEqual(shuffle(createDeck(), seededRng(2)))
  })
})
