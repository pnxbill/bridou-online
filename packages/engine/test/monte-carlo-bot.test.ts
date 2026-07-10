import type { GameSnapshot, RoundPlayer, TurnSnapshot } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { createHeuristicBot } from '../src/bot'
import { createMonteCarloBot } from '../src/monte-carlo-bot'
import { Game } from '../src/game'
import {
  ManualScheduler,
  RecordingPublisher,
  makePlayers,
  playFullGame,
  seededRng,
} from './helpers'

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
  betting?: boolean
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
      betting: setup.betting ?? setup.currentTurn === undefined,
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

const bot = createMonteCarloBot({ samples: 40, rng: seededRng(7) })

describe('Monte Carlo decideBet', () => {
  it('bets high with a hand full of high trunfos', () => {
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snapshot({ trunfo: '2-♦️', betting: true }),
      hand: ['A-♦️', 'K-♦️', 'Q-♦️'],
      availableBets: [0, 1, 2, 3],
    })
    expect(bet).toBeGreaterThanOrEqual(2)
  })

  it('bets low with a garbage hand', () => {
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snapshot({ trunfo: 'A-♦️', betting: true }),
      hand: ['2-♠️', '3-♣️', '4-♥️'],
      availableBets: [0, 1, 2, 3],
    })
    expect(bet).toBeLessThanOrEqual(1)
  })

  it('always picks a legal bet', () => {
    const availableBets = [0, 2, 3]
    const bet = bot.decideBet({
      playerId: 'bot',
      snapshot: snapshot({ trunfo: '2-♦️', betting: true }),
      hand: ['A-♦️', '2-♠️', '3-♣️'],
      availableBets,
    })
    expect(availableBets).toContain(bet)
  })
})

describe('Monte Carlo decideCard', () => {
  const seats = [player('a', 0), player('b', 0), player('bot', 1)]

  it('looks ahead: spends the ace so the leftover nine is less likely to overshoot', () => {
    // Both cards win the current trick (bot still needs 1). After winning,
    // one card remains — keeping the ace would often take a second trick and
    // bail. Monte Carlo prefers dumping the ace now.
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: seats,
        cardsForEachPlayer: 2,
        currentTurn: turn(['5-♠️', '7-♠️'], seats),
        betting: false,
      }),
      playableCards: [
        { value: '9-♠️', disabled: false },
        { value: 'A-♠️', disabled: false },
      ],
    })
    expect(card).toBe('A-♠️')
  })

  it('never plays a disabled card', () => {
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: seats,
        currentTurn: turn(['5-♠️', '7-♠️'], seats),
        betting: false,
      }),
      playableCards: [
        { value: 'A-♥️', disabled: true },
        { value: '8-♠️', disabled: false },
      ],
    })
    expect(card).toBe('8-♠️')
  })

  it('ducks once its bet is already made', () => {
    const madeAlready = [player('a', 0), player('b', 0), player('bot', 1)]
    const card = bot.decideCard({
      playerId: 'bot',
      snapshot: snapshot({
        players: madeAlready,
        whoMade: [player('bot', 1)],
        currentTurn: turn(['A-♠️', '6-♠️'], madeAlready),
        betting: false,
      }),
      playableCards: [
        { value: 'K-♠️', disabled: false },
        { value: '3-♠️', disabled: false },
      ],
    })
    // Both lose to the ace — prefer shedding the king (same as heuristic)
    expect(card).toBe('K-♠️')
  })
})

describe('Monte Carlo strength', () => {
  it('beats random players on average over many games', () => {
    const botTotals: number[] = []
    const randomTotals: number[] = []

    for (let seed = 1; seed <= 15; seed++) {
      const publisher = new RecordingPublisher()
      const scheduler = new ManualScheduler()
      const rng = seededRng(seed)
      const players = makePlayers(4)
      const game = new Game(
        { id: `g${seed}`, leaderId: 'p1', players },
        { publisher, scheduler, rng },
      )
      playFullGame(game, publisher, scheduler, rng, {
        strategies: { p1: createMonteCarloBot({ samples: 30, rng: seededRng(seed + 1000) }) },
      })

      const scoreboard = game.scoreboard
      botTotals.push(scoreboard.find((e) => e.id === 'p1')!.totalPoints)
      scoreboard
        .filter((e) => e.id !== 'p1')
        .forEach((e) => randomTotals.push(e.totalPoints))
    }

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avg(botTotals)).toBeGreaterThan(avg(randomTotals) + 8)
  })

  it('outscores 4 heuristic bots over many full games', () => {
    const GAMES = 50
    const mcTotals: number[] = []
    const heuristicTotals: number[] = []
    let mcWins = 0

    for (let seed = 1; seed <= GAMES; seed++) {
      const publisher = new RecordingPublisher()
      const scheduler = new ManualScheduler()
      const rng = seededRng(seed)
      const heuristic = createHeuristicBot()
      const game = new Game(
        { id: `mc-vs-h${seed}`, leaderId: 'p1', players: makePlayers(5) },
        { publisher, scheduler, rng },
      )
      playFullGame(game, publisher, scheduler, rng, {
        strategies: {
          p1: createMonteCarloBot({ samples: 60, rng: seededRng(seed + 9000) }),
          p2: heuristic,
          p3: heuristic,
          p4: heuristic,
          p5: heuristic,
        },
      })

      const scoreboard = game.scoreboard
      const mcScore = scoreboard.find((e) => e.id === 'p1')!.totalPoints
      const others = scoreboard.filter((e) => e.id !== 'p1').map((e) => e.totalPoints)
      mcTotals.push(mcScore)
      heuristicTotals.push(...others)
      if (mcScore > Math.max(...others)) mcWins++
    }

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const mcAvg = avg(mcTotals)
    const hAvg = avg(heuristicTotals)

    // eslint-disable-next-line no-console
    console.log(
      `MC vs 4× heuristic over ${GAMES} games: MC avg=${mcAvg.toFixed(1)}, ` +
        `heuristic avg=${hAvg.toFixed(1)}, MC sole wins=${mcWins}/${GAMES}`,
    )

    expect(mcAvg).toBeGreaterThan(hAvg)
  }, 120_000)
})
