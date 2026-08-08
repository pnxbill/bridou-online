import {
  BASEADO_FREE_TRAGADAS,
  baseadoPoints,
  isCachimbo,
  type GameSnapshot,
  type RoundPlayer,
} from '@bridou/shared'
import { describe, expect, it, vi } from 'vitest'
import { shouldPassBaseado } from '../src/bot'
import { GameError } from '../src/errors'
import type { RoundPlayerState } from '../src/player'
import { Round } from '../src/round'
import {
  ManualScheduler,
  RecordingPublisher,
  drivePendingRequests,
  makeRoundPlayer,
  seededRng,
} from './helpers'

/**
 * O baseado — the blunt that goes around the table.
 *
 * It burns on the round's own clock (one tragada per completed trick), which
 * is why the whole thing lives in the pure engine: no wall clock is involved,
 * and a full round of it replays identically from a seed.
 */

const makeRound = ({
  roundNumber = 3,
  playerCount = 3,
  seed = 1,
  baseado = true,
} = {}) => {
  const publisher = new RecordingPublisher()
  const scheduler = new ManualScheduler()
  const onComplete = vi.fn()
  const players: RoundPlayerState[] = Array.from({ length: playerCount }, (_, i) =>
    makeRoundPlayer(`p${i + 1}`, []),
  )
  const round = new Round(
    { roundNumber, players, baseado },
    { publisher, rng: seededRng(seed), scheduler, onComplete },
  )
  const rng = seededRng(seed + 1000)
  const cursor = { index: 0 }
  /** Answers every pending bet/play, then lets the between-tricks pause elapse. */
  const step = () => {
    drivePendingRequests(round, publisher, rng, cursor)
    const more = scheduler.pending.length > 0
    scheduler.flush()
    return more
  }
  /** Runs the round to the end. */
  const finish = () => {
    let guard = 30
    while (step()) if (--guard === 0) throw new Error('round never finished')
  }
  return { round, publisher, scheduler, players, step, finish }
}

describe('baseadoPoints', () => {
  it('pays a point per tragada up to three when the bet was made', () => {
    expect(baseadoPoints(0, true)).toBe(0)
    expect(baseadoPoints(1, true)).toBe(1)
    expect(baseadoPoints(2, true)).toBe(2)
    expect(baseadoPoints(BASEADO_FREE_TRAGADAS, true)).toBe(3)
  })

  it('takes them back past the third — the curve peaks and comes down', () => {
    expect([4, 5, 6, 7].map((t) => baseadoPoints(t, true))).toEqual([2, 1, 0, -1])
  })

  it('nursing it through a whole round is worse than never touching it', () => {
    expect(baseadoPoints(7, true)).toBeLessThan(baseadoPoints(0, true))
  })

  it('charges a bailador for every tragada, with no cap', () => {
    expect([1, 3, 7].map((t) => baseadoPoints(t, false))).toEqual([-1, -3, -7])
  })

  it('calls anything past the free tragadas a cachimbo', () => {
    expect(isCachimbo(BASEADO_FREE_TRAGADAS)).toBe(false)
    expect(isCachimbo(BASEADO_FREE_TRAGADAS + 1)).toBe(true)
  })
})

describe('lighting it', () => {
  it("starts the round with the first bettor and says so", () => {
    const { round, publisher } = makeRound({ playerCount: 4 })
    round.start()

    expect(round.baseadoHolderId).toBe('p1')
    expect(round.snapshot().baseadoHolderId).toBe('p1')
    expect(publisher.last('baseado-passed')).toEqual({
      type: 'baseado-passed',
      fromPlayerId: null,
      toPlayerId: 'p1',
    })
  })

  it('leaves the table without one when the game plays without it', () => {
    const { round, publisher, finish, players } = makeRound({ baseado: false })
    round.start()
    finish()

    expect(round.baseadoHolderId).toBeNull()
    expect(publisher.ofType('baseado-passed')).toHaveLength(0)
    expect(publisher.ofType('baseado-puffed')).toHaveLength(0)
    expect(players.every((p) => p.tragadas === 0)).toBe(true)
    players.forEach((p) => expect(p.points).toBe(p.bet === p.made ? 10 + p.made! : -1))
  })
})

describe('passing it', () => {
  it('goes to the next seat, and only its holder may pass it', () => {
    const { round, publisher } = makeRound({ playerCount: 3 })
    round.start()

    expect(() => round.passBaseado('p2')).toThrow(GameError)
    round.passBaseado('p1')

    expect(round.baseadoHolderId).toBe('p2')
    expect(publisher.last('baseado-passed')).toEqual({
      type: 'baseado-passed',
      fromPlayerId: 'p1',
      toPlayerId: 'p2',
    })
  })

  it('wraps around the roda back to the first seat', () => {
    const { round } = makeRound({ playerCount: 3 })
    round.start()
    round.passBaseado('p1')
    round.passBaseado('p2')
    round.passBaseado('p3')
    expect(round.baseadoHolderId).toBe('p1')
  })

  it('is refused once the round is over', () => {
    const { round, finish } = makeRound({ playerCount: 2, roundNumber: 1 })
    round.start()
    finish()
    expect(() => round.passBaseado(round.baseadoHolderId!)).toThrow(GameError)
  })
})

describe('burning it', () => {
  it('charges a tragada to whoever holds it when a trick resolves', () => {
    const { round, publisher, players, step } = makeRound({ playerCount: 3 })
    round.start()
    step()

    expect(players[0]!.tragadas).toBe(1)
    expect(publisher.last('baseado-puffed')).toEqual({
      type: 'baseado-puffed',
      playerId: 'p1',
      tragadas: 1,
    })
  })

  it('puts the tragada on the seat holding it when the trick lands, not before', () => {
    const { round, players, step } = makeRound({ playerCount: 3 })
    round.start()
    round.passBaseado('p1') // dumped before the first trick resolved
    step()

    expect(players[0]!.tragadas).toBe(0)
    expect(players[1]!.tragadas).toBe(1)
  })

  it('keeps burning for a seat that never passes it', () => {
    const { round, players, finish } = makeRound({ roundNumber: 5, playerCount: 3 })
    round.start()
    finish()

    expect(players[0]!.tragadas).toBe(5)
    expect(players.slice(1).every((p) => p.tragadas === 0)).toBe(true)
  })
})

describe('settling it', () => {
  /**
   * A one-card round with both seats calling 1: exactly one of them lands the
   * bet, and p1 holds the baseado through the single trick either way. So the
   * shuffle decides who wins, and the assertion covers both outcomes without
   * pinning a seed to a deal.
   */
  const oneCardShowdown = (seed: number) => {
    const { round, players, scheduler } = makeRound({ roundNumber: 1, playerCount: 2, seed })
    round.start()
    round.placeBet('p1', 1)
    round.placeBet('p2', 1)
    round.playCard('p1', players[0]!.cards[0]!)
    round.playCard('p2', players[1]!.cards[0]!)
    scheduler.flush()
    return { round, players }
  }

  it('adds the tragadas to a made bet and subtracts them from a bailada', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { round, players } = oneCardShowdown(seed)
      const p1 = players[0]!
      expect(p1.tragadas).toBe(1)
      expect(p1.points).toBe(round.whoMade[0]!.id === 'p1' ? 10 + 1 + 1 : -1 - 1)
    }
  })

  it('still calls a bailador a bailador, however far below -1 they land', () => {
    const { round, players, finish } = makeRound({ roundNumber: 5, playerCount: 3, seed: 9 })
    round.start()
    finish()

    const hogged = players[0]!
    expect(hogged.tragadas).toBe(5)
    if (hogged.bet !== hogged.made) {
      expect(hogged.points).toBe(-1 + baseadoPoints(5, false))
      expect(round.bailadores.map((b) => b.id)).toContain('p1')
    }
    // whatever the deal did, bailadores is read off the bet, never the points
    expect(round.bailadores.map((b) => b.id)).toEqual(
      players.filter((p) => p.bet !== p.made).map((p) => p.id),
    )
  })

  it('reports the whole table on round-ended so a client can explain the score', () => {
    const { round, publisher, finish } = makeRound({ roundNumber: 3, playerCount: 3 })
    round.start()
    finish()

    const ended = publisher.last('round-ended')!
    expect(ended.players?.map((p) => p.id)).toEqual(round.players.map((p) => p.id))
    expect(ended.players?.find((p) => p.id === 'p1')?.tragadas).toBe(3)
  })
})

describe('shouldPassBaseado', () => {
  const seat = (id: string, bet: number | null): RoundPlayer => ({
    id,
    name: id,
    bet,
    made: null,
    points: null,
  })

  const snapshot = ({
    bet = 2,
    won = 0,
    tricksPlayed = 0,
    cardsForEachPlayer = 5,
  } = {}): GameSnapshot => ({
    id: 'g1',
    leaderId: 'bot',
    currentRoundNumber: 5,
    scoreboardShowing: false,
    finished: false,
    scoreboard: [],
    currentRound: {
      currentRoundNumber: 5,
      cardsForEachPlayer,
      numOfPlayers: 3,
      trunfo: '2-♦️',
      players: [seat('bot', bet), seat('a', 1), seat('b', 1)],
      betting: false,
      turns: Array.from({ length: tricksPlayed }, () => ({
        players: [],
        suit: null,
        playedCards: [],
        trunfo: '2-♦️',
      })),
      currentTurn: null,
      whoMade: Array.from({ length: won }, () => seat('bot', bet)),
      bailadores: [],
      baseadoHolderId: 'bot',
    },
  })

  const pass = (args: Parameters<typeof shouldPassBaseado>[0]) => shouldPassBaseado(args)

  it('holds while the bet is still live', () => {
    expect(pass({ snapshot: snapshot({ bet: 2, won: 1, tricksPlayed: 2 }), playerId: 'bot', tragadas: 1 }))
      .toBe(false)
  })

  it('never lets it become a cachimbo', () => {
    expect(
      pass({
        snapshot: snapshot({ bet: 2, won: 1, tricksPlayed: 2 }),
        playerId: 'bot',
        tragadas: BASEADO_FREE_TRAGADAS,
      }),
    ).toBe(true)
  })

  it('dumps it the moment it has taken more tricks than it called', () => {
    expect(pass({ snapshot: snapshot({ bet: 1, won: 2, tricksPlayed: 2 }), playerId: 'bot', tragadas: 1 }))
      .toBe(true)
  })

  it('dumps it when the bet is out of reach with the tricks left', () => {
    // needs 3 more with only 1 trick to come
    expect(pass({ snapshot: snapshot({ bet: 3, won: 0, tricksPlayed: 4 }), playerId: 'bot', tragadas: 1 }))
      .toBe(true)
  })

  it('holds through the betting phase, when there is nothing to read yet', () => {
    expect(pass({ snapshot: snapshot({ bet: null as unknown as number }), playerId: 'bot', tragadas: 0 }))
      .toBe(false)
  })
})
