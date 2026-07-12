import type { GameSnapshot, RoundPlayer, TurnSnapshot } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { createHeuristicBot } from '../src/bot'
import { Game } from '../src/game'
import {
  ManualScheduler,
  RecordingPublisher,
  makePlayers,
  playFullGame,
  seededRng,
} from './helpers'

const bot = createHeuristicBot()

const player = (id: string, bet: number | null = null): RoundPlayer => ({
  id,
  name: id,
  bet,
  made: null,
  points: null,
})

interface ViewSetup {
  trunfo?: string
  players?: RoundPlayer[]
  cardsForEachPlayer?: number
  whoMade?: RoundPlayer[]
  currentTurn?: TurnSnapshot | null
}

const snapshot = (setup: ViewSetup = {}): GameSnapshot => {
  const players = setup.players ?? [player('bot', 1), player('a', 0), player('b', 0)]
  return {
    id: 'g1',
    leaderId: 'a',
    currentRoundNumber: 3,
    scoreboardShowing: false,
    finished: false,
    scoreboard: [],
    currentRound: {
      currentRoundNumber: 3,
      cardsForEachPlayer: setup.cardsForEachPlayer ?? 3,
      numOfPlayers: players.length,
      trunfo: setup.trunfo ?? '2-♦️',
      players,
      betting: setup.currentTurn === undefined,
      turns: [],
      currentTurn: setup.currentTurn ?? null,
      whoMade: setup.whoMade ?? [],
      bailadores: [],
    },
  }
}

const turn = (playedCards: string[], players: RoundPlayer[]): TurnSnapshot => ({
  players,
  suit: playedCards.length ? playedCards[0]!.split('-')[1]! : null,
  playedCards,
  trunfo: '2-♦️',
})

describe('decideBet', () => {
  it('bets high with a hand full of high trunfos', () => {
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snapshot({ trunfo: '2-♦️' }),
      hand: ['A-♦️', 'K-♦️', 'Q-♦️'],
      availableBets: [0, 1, 2, 3],
    })
    expect(bet).toBe(3)
  })

  it('bets zero with a garbage hand', () => {
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snapshot({ trunfo: 'A-♦️' }),
      hand: ['2-♠️', '3-♣️', '4-♥️'],
      availableBets: [0, 1, 2, 3],
    })
    expect(bet).toBe(0)
  })

  it('always picks a legal bet, snapping to the nearest when its target is forbidden', () => {
    // One strong trunfo → wants 1, but 1 is forbidden for the last bettor
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snapshot({ trunfo: '2-♦️' }),
      hand: ['A-♦️', '2-♠️', '3-♣️'],
      availableBets: [0, 2, 3],
    })
    expect([0, 2]).toContain(bet)
  })
})

describe('decideCard', () => {
  const seats = [player('a', 0), player('b', 0), player('bot', 1)]

  it('wins as cheaply as possible when last to act and hunting a trick', () => {
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: seats,
        currentTurn: turn(['5-♠️', '7-♠️'], seats),
      }),
      playableCards: [
        { value: '9-♠️', disabled: false },
        { value: 'A-♠️', disabled: false },
      ],
    })
    expect(card).toBe('9-♠️') // both beat the 7; spend the cheaper one
  })

  it('leads with its strongest card when it still needs tricks', () => {
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({ players: seats, currentTurn: turn([], seats) }),
      playableCards: [
        { value: '4-♥️', disabled: false },
        { value: 'A-♦️', disabled: false }, // trunfo ace
      ],
    })
    expect(card).toBe('A-♦️')
  })

  it('ducks with its most dangerous safe card once its bet is made', () => {
    const madeAlready = [player('a', 0), player('b', 0), player('bot', 1)]
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: madeAlready,
        whoMade: [player('bot', 1)], // bot already took its trick
        currentTurn: turn(['A-♠️', '6-♠️'], madeAlready),
      }),
      playableCards: [
        { value: 'K-♠️', disabled: false },
        { value: '3-♠️', disabled: false },
      ],
    })
    expect(card).toBe('K-♠️') // both lose to the ace: shed the king, keep the safe 3
  })

  it('dumps its weakest card when it cannot win the trick', () => {
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: seats,
        currentTurn: turn(['A-♦️', '3-♦️'], seats), // trunfo ace on the table
      }),
      playableCards: [
        { value: 'K-♥️', disabled: false },
        { value: '5-♥️', disabled: false },
      ],
    })
    expect(card).toBe('5-♥️')
  })

  it('never plays a disabled card', () => {
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: seats,
        currentTurn: turn(['5-♠️', '7-♠️'], seats),
      }),
      playableCards: [
        { value: 'A-♥️', disabled: true },
        { value: '8-♠️', disabled: false },
      ],
    })
    expect(card).toBe('8-♠️')
  })
})

describe('blind last round', () => {
  it('plays HIDDEN_CARD when that is the only playable slot', () => {
    const players = [player('bot', 1), player('a', 0)]
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: {
        ...snapshot({
          players,
          cardsForEachPlayer: 1,
          currentTurn: turn([], players),
          betting: false,
        }),
        currentRoundNumber: 13,
        currentRound: {
          ...snapshot({ players, cardsForEachPlayer: 1, currentTurn: turn([], players), betting: false })
            .currentRound,
          currentRoundNumber: 13,
        },
      },
      playableCards: [{ value: 'hidden', disabled: false }],
      opponentHands: { a: ['K-♥️'] },
    })
    expect(card).toBe('hidden')
  })

  it('blind bet stays legal and ducks against a revealed ace of trunfo', () => {
    const snap = snapshot({
      trunfo: '2-♣️',
      cardsForEachPlayer: 1,
      players: [player('bot', null), player('a', null)],
    })
    snap.currentRoundNumber = 13
    snap.currentRound.currentRoundNumber = 13
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snap,
      hand: ['hidden'],
      availableBets: [0, 1],
      opponentHands: { a: ['A-♣️'] },
    })
    expect(bet).toBe(0)
  })
})

describe('bot strength', () => {
  it('beats random players on average over many games', () => {
    const botTotals: number[] = []
    const randomTotals: number[] = []

    for (let seed = 1; seed <= 25; seed++) {
      const publisher = new RecordingPublisher()
      const scheduler = new ManualScheduler()
      const rng = seededRng(seed)
      const players = makePlayers(4)
      const game = new Game(
        { id: `g${seed}`, leaderId: 'p1', players },
        { publisher, scheduler, rng },
      )
      playFullGame(game, publisher, scheduler, rng, {
        strategies: { p1: createHeuristicBot() },
      })

      const scoreboard = game.scoreboard
      botTotals.push(scoreboard.find((e) => e.id === 'p1')!.totalPoints)
      scoreboard
        .filter((e) => e.id !== 'p1')
        .forEach((e) => randomTotals.push(e.totalPoints))
    }

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const botAvg = avg(botTotals)
    const randomAvg = avg(randomTotals)

    // Not a subtle edge: a sensible player should clearly outscore random play
    expect(botAvg).toBeGreaterThan(randomAvg + 10)
  })
})
