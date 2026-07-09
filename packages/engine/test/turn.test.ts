import { describe, expect, it } from 'vitest'
import { GameError } from '../src/errors'
import { Turn } from '../src/turn'
import { makeRoundPlayer } from './helpers'

const makeTurn = (hands: Record<string, string[]>, trunfo = '2-♦️') =>
  new Turn({
    players: Object.entries(hands).map(([id, cards]) => makeRoundPlayer(id, cards)),
    trunfo,
  })

describe('playing a card', () => {
  it('lets the first player play anything and sets the trick suit', () => {
    const turn = makeTurn({ a: ['A-♠️', 'K-♥️'], b: ['3-♠️'] })
    turn.playCard('a', 'K-♥️')
    expect(turn.suit).toBe('♥️')
    expect(turn.playedCards).toEqual(['K-♥️'])
  })

  it('removes the played card from the hand', () => {
    const turn = makeTurn({ a: ['A-♠️', 'K-♥️'], b: ['3-♠️'] })
    turn.playCard('a', 'A-♠️')
    expect(turn.players[0]!.cards).toEqual(['K-♥️'])
  })

  it('forces following suit when the player has it', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️', 'K-♥️'] })
    turn.playCard('a', 'A-♠️')
    expect(() => turn.playCard('b', 'K-♥️')).toThrow(
      'If you have a card with the current suit, you must play it',
    )
    turn.playCard('b', '3-♠️')
    expect(turn.playedCards).toEqual(['A-♠️', '3-♠️'])
  })

  it('allows discarding any card when void in the led suit', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['K-♥️', '4-♣️'] })
    turn.playCard('a', 'A-♠️')
    expect(() => turn.playCard('b', 'K-♥️')).not.toThrow()
  })

  it('rejects playing out of turn', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️'] })
    expect(() => turn.playCard('b', '3-♠️')).toThrow('Not your turn')
  })

  it('rejects a card the player does not hold', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️'] })
    expect(() => turn.playCard('a', 'Q-♣️')).toThrow("doesn't have the card")
  })

  it('rejects plays after the trick is complete', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️'] })
    turn.playCard('a', 'A-♠️')
    turn.playCard('b', '3-♠️')
    expect(turn.isComplete).toBe(true)
    expect(() => turn.playCard('a', 'A-♠️')).toThrow(GameError)
  })
})

describe('winner', () => {
  it('is the highest card of the led suit when no trunfo is played', () => {
    const turn = makeTurn({ a: ['5-♠️'], b: ['K-♠️'], c: ['A-♥️'] }, '2-♦️')
    turn.playCard('a', '5-♠️')
    turn.playCard('b', 'K-♠️')
    turn.playCard('c', 'A-♥️') // off-suit ace does not win
    expect(turn.winner.id).toBe('b')
  })

  it('is beaten by any trunfo', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♦️'] }, '2-♦️')
    turn.playCard('a', 'A-♠️')
    turn.playCard('b', '3-♦️')
    expect(turn.winner.id).toBe('b')
  })

  it('is the highest trunfo when several are played', () => {
    const turn = makeTurn({ a: ['4-♦️'], b: ['J-♦️'], c: ['7-♦️'] }, '2-♦️')
    turn.playCard('a', '4-♦️')
    turn.playCard('b', 'J-♦️')
    turn.playCard('c', '7-♦️')
    expect(turn.winner.id).toBe('b')
  })

  it('ranks 10 below J, Q, K, A', () => {
    const turn = makeTurn({ a: ['10-♠️'], b: ['J-♠️'] }, '2-♦️')
    turn.playCard('a', '10-♠️')
    turn.playCard('b', 'J-♠️')
    expect(turn.winner.id).toBe('b')
  })

  it('cannot be read before the trick completes', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️'] })
    turn.playCard('a', 'A-♠️')
    expect(() => turn.winner).toThrow('Turn is not complete yet')
  })
})

describe('getPlayableCards', () => {
  it('enables the whole hand for the leader', () => {
    const turn = makeTurn({ a: ['A-♠️', 'K-♥️'], b: ['3-♠️'] })
    expect(turn.getPlayableCards('a')).toEqual([
      { value: 'A-♠️', disabled: false },
      { value: 'K-♥️', disabled: false },
    ])
  })

  it('disables everything for a player waiting their turn', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️', 'K-♥️'] })
    expect(turn.getPlayableCards('b')).toEqual([
      { value: '3-♠️', disabled: true },
      { value: 'K-♥️', disabled: true },
    ])
  })

  it('disables off-suit cards when the player can follow suit', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️', 'K-♥️'] })
    turn.playCard('a', 'A-♠️')
    expect(turn.getPlayableCards('b')).toEqual([
      { value: '3-♠️', disabled: false },
      { value: 'K-♥️', disabled: true },
    ])
  })

  it('enables the whole hand when void in the led suit', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['4-♣️', 'K-♥️'] })
    turn.playCard('a', 'A-♠️')
    expect(turn.getPlayableCards('b')).toEqual([
      { value: '4-♣️', disabled: false },
      { value: 'K-♥️', disabled: false },
    ])
  })

  it('defaults to the current player when no id is given', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️'] })
    expect(turn.getPlayableCards()).toEqual([{ value: 'A-♠️', disabled: false }])
  })
})

describe('snapshot', () => {
  it('never exposes player hands', () => {
    const turn = makeTurn({ a: ['A-♠️'], b: ['3-♠️'] })
    const snapshot = turn.snapshot()
    snapshot.players.forEach((player) => expect(player).not.toHaveProperty('cards'))
  })
})
