import { Game, createHeuristicBot } from '@bridou/engine'
import type { DomainEvent, PlayerInfo, RoundPlayer } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { GameHistoryRecorder } from '../src/application/game-history'
import type { StoredGameEvent } from '../src/application/ports'
import { buildRecap } from '../src/application/recap'
import {
  InMemoryGameHistoryRepository,
  InMemoryPlayerRepository,
} from '../src/infra/in-memory-history'
import {
  ManualScheduler,
  RecordingPublisher,
  makePlayers,
  playFullGame,
  seededRng,
} from '../../../packages/engine/test/helpers'

/** Wraps bare domain events in the stored envelope buildRecap reads. */
const stored = (events: DomainEvent[]): StoredGameEvent[] =>
  events.map((payload, i) => ({
    gameId: 'g',
    seq: i + 1,
    type: payload.type,
    playerId: 'playerId' in payload ? payload.playerId : null,
    payload,
    createdAt: new Date(),
  }))

const asRoundPlayer = (p: PlayerInfo): RoundPlayer => ({ ...p, bet: null, made: null, points: null })

/**
 * Builds the event sequence for one round: deal, bets, trick winners, close.
 * `winners` names the winner of each trick in order.
 */
const roundEvents = (
  roster: PlayerInfo[],
  roundNumber: number,
  cards: number,
  bets: Record<string, number>,
  winners: string[],
): DomainEvent[] => {
  const roundPlayers = roster.map(asRoundPlayer)
  const events: DomainEvent[] = [
    {
      type: 'round-started',
      round: {
        currentRoundNumber: roundNumber,
        cardsForEachPlayer: cards,
        numOfPlayers: roster.length,
        trunfo: 'K-♠️',
        players: roundPlayers,
        betting: true,
        turns: [],
        currentTurn: null,
        whoMade: [],
        bailadores: [],
      },
    },
  ]
  for (const [playerId, bet] of Object.entries(bets)) {
    events.push({ type: 'player-bet', playerId, bet })
  }
  for (const winnerId of winners) {
    events.push({
      type: 'turn-ended',
      turn: {
        players: roundPlayers,
        suit: '♦️',
        playedCards: roster.map(() => '2-♦️'),
        trunfo: 'K-♠️',
      },
      winnerId,
    })
  }
  events.push({ type: 'round-ended', bailadores: [] })
  return events
}

const build = (events: DomainEvent[], over: { ranked?: boolean } = {}) =>
  buildRecap({
    gameId: 'g',
    events: stored(events),
    startedAt: new Date('2026-03-10T20:00:00Z'),
    endedAt: new Date('2026-03-10T20:40:00Z'),
    ranked: over.ranked ?? true,
  })

const awardIds = (recap: ReturnType<typeof build>) => recap?.awards.map((a) => a.id) ?? []
const awardFor = (recap: ReturnType<typeof build>, id: string) =>
  recap?.awards.find((a) => a.id === id)

describe('buildRecap', () => {
  const roster: PlayerInfo[] = [
    { id: 'ana', name: 'Ana' },
    { id: 'bru', name: 'Bruno' },
  ]

  const endGame = (ana: number, bru: number): DomainEvent => ({
    type: 'game-ended',
    scoreboard: [
      { id: 'ana', name: 'Ana', totalPoints: ana },
      { id: 'bru', name: 'Bruno', totalPoints: bru },
    ],
  })

  it('returns null for a log that never finished', () => {
    expect(build(roundEvents(roster, 1, 1, { ana: 1, bru: 0 }, ['ana']))).toBeNull()
  })

  it('replays bets and tricks into a per-round progression', () => {
    const recap = build([
      ...roundEvents(roster, 1, 1, { ana: 1, bru: 0 }, ['ana']),
      ...roundEvents(roster, 2, 2, { ana: 0, bru: 2 }, ['bru', 'bru']),
      endGame(21, 22),
    ])

    // round 1: Ana 1/1 = 11, Bruno 0/0 = 10
    expect(recap?.progression[0]).toEqual({ roundNumber: 1, totals: { ana: 11, bru: 10 } })
    // round 2: Ana 0/0 = +10 → 21, Bruno 2/2 = +12 → 22
    expect(recap?.progression[1]).toEqual({ roundNumber: 2, totals: { ana: 21, bru: 22 } })
    expect(recap?.durationMs).toBe(40 * 60 * 1000)
  })

  it('awards o bailarino to the sole biggest loser', () => {
    const recap = build([
      // Bruno misses both rounds, Ana hits both
      ...roundEvents(roster, 1, 1, { ana: 1, bru: 1 }, ['ana']),
      ...roundEvents(roster, 2, 1, { ana: 1, bru: 1 }, ['ana']),
      endGame(22, -2),
    ])
    expect(awardFor(recap, 'bailarino')).toMatchObject({
      playerId: 'bru',
      detail: 'bailou 2 vezes',
    })
  })

  it('skips an award when the leaders tie — no invented winners', () => {
    const recap = build([
      // both bail the same number of times
      ...roundEvents(roster, 1, 1, { ana: 1, bru: 1 }, ['ana']),
      ...roundEvents(roster, 2, 1, { ana: 0, bru: 0 }, ['ana']),
      endGame(10, 9),
    ])
    expect(awardIds(recap)).not.toContain('bailarino')
  })

  it('awards mao de ferro only from three exact bets in a row', () => {
    const three = build([
      ...roundEvents(roster, 1, 1, { ana: 1, bru: 1 }, ['ana']),
      ...roundEvents(roster, 2, 1, { ana: 1, bru: 1 }, ['ana']),
      ...roundEvents(roster, 3, 1, { ana: 1, bru: 1 }, ['ana']),
      endGame(33, -3),
    ])
    expect(awardFor(three, 'maoDeFerro')).toMatchObject({
      playerId: 'ana',
      detail: '3 apostas exatas seguidas',
    })

    const two = build([
      ...roundEvents(roster, 1, 1, { ana: 1, bru: 1 }, ['ana']),
      ...roundEvents(roster, 2, 1, { ana: 1, bru: 1 }, ['ana']),
      endGame(22, -2),
    ])
    expect(awardIds(two)).not.toContain('maoDeFerro')
  })

  it('awards carrasco only to a winner with a real margin', () => {
    const blowout = build([...roundEvents(roster, 1, 1, { ana: 1, bru: 0 }, ['ana']), endGame(100, 40)])
    expect(awardFor(blowout, 'carrasco')).toMatchObject({
      playerId: 'ana',
      detail: 'venceu por 60 pontos',
    })

    const close = build([...roundEvents(roster, 1, 1, { ana: 1, bru: 0 }, ['ana']), endGame(100, 95)])
    expect(awardIds(close)).not.toContain('carrasco')
  })

  it('measures the zebra climb against the half-time scoreboard', () => {
    const trio: PlayerInfo[] = [...roster, { id: 'caio', name: 'Caio' }]
    const recap = build([
      ...roundEvents(trio, 1, 1, { ana: 0, bru: 0, caio: 1 }, ['caio']),
      {
        type: 'scoreboard-shown',
        scoreboard: [
          { id: 'bru', name: 'Bruno', totalPoints: 60 },
          { id: 'ana', name: 'Ana', totalPoints: 50 },
          { id: 'caio', name: 'Caio', totalPoints: 40 },
        ],
      },
      {
        type: 'game-ended',
        scoreboard: [
          { id: 'caio', name: 'Caio', totalPoints: 120 },
          { id: 'bru', name: 'Bruno', totalPoints: 100 },
          { id: 'ana', name: 'Ana', totalPoints: 90 },
        ],
      },
    ])

    // Caio went from 3rd at half time to 1st
    expect(awardFor(recap, 'zebra')).toMatchObject({
      playerId: 'caio',
      detail: 'subiu 2 posições desde a rodada 7',
    })
    expect(recap?.biggestComeback).toMatchObject({ playerId: 'caio', positions: 2 })
  })

  it('collects conquista unlocks straight out of the log', () => {
    const recap = build([
      ...roundEvents(roster, 1, 1, { ana: 1, bru: 0 }, ['ana']),
      { type: 'achievement-unlocked', playerId: 'ana', achievementId: 'kamikaze', at: 1 },
      endGame(11, 10),
    ])
    expect(recap?.unlocks).toEqual([{ playerId: 'ana', achievementId: 'kamikaze' }])
  })

  it('never hands an award to a bot seat', () => {
    const withBot: PlayerInfo[] = [roster[0]!, { id: 'bot-1', name: 'Botelho', isBot: true }]
    const recap = build([
      // the bot bails twice, Ana never does
      ...roundEvents(withBot, 1, 1, { ana: 1, 'bot-1': 1 }, ['ana']),
      ...roundEvents(withBot, 2, 1, { ana: 1, 'bot-1': 1 }, ['ana']),
      {
        type: 'game-ended',
        scoreboard: [
          { id: 'ana', name: 'Ana', totalPoints: 22 },
          { id: 'bot-1', name: 'Botelho', isBot: true, totalPoints: -2 },
        ],
      },
    ])
    expect(recap?.awards.every((a) => a.playerId !== 'bot-1')).toBe(true)
  })
})

describe('buildRecap over a real recorded game', () => {
  it('produces a complete resenha from a full 13-round game', async () => {
    const history = new InMemoryGameHistoryRepository()
    const recorder = new GameHistoryRecorder(history, new InMemoryPlayerRepository())

    const publisher = new RecordingPublisher()
    const scheduler = new ManualScheduler()
    const rng = seededRng(7)
    const roster = makePlayers(4)
    const game = new Game(
      { id: 'recap-1', leaderId: 'p1', players: roster },
      {
        publisher: {
          publish: (event) => {
            publisher.publish(event)
            recorder.onDomainEvent('recap-1', event)
          },
        },
        scheduler,
        rng,
      },
    )
    recorder.recordGameStarted({ gameId: 'recap-1', leaderId: 'p1', roster })
    playFullGame(game, publisher, scheduler, rng, {
      strategies: Object.fromEntries(roster.map((p) => [p.id, createHeuristicBot()])),
    })
    await recorder.flush('recap-1')

    const summary = await history.getGame('recap-1')
    expect(summary?.status).toBe('finished')

    const recap = buildRecap({
      gameId: 'recap-1',
      events: await history.getGameEvents('recap-1'),
      startedAt: summary!.startedAt,
      endedAt: summary!.endedAt!,
      ranked: summary!.ranked,
    })

    expect(recap).not.toBeNull()
    expect(recap!.players).toHaveLength(4)
    expect(recap!.finalScoreboard).toHaveLength(4)
    // one progression point per round, in order
    expect(recap!.progression).toHaveLength(13)
    expect(recap!.progression.map((p) => p.roundNumber)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    )

    // The recap's own replay of the scoring must agree with the engine's.
    const last = recap!.progression.at(-1)!.totals
    for (const entry of recap!.finalScoreboard) {
      expect(last[entry.id]).toBe(entry.totalPoints)
    }

    expect(recap!.awards.length).toBeGreaterThan(0)
    for (const a of recap!.awards) {
      expect(a.detail).toBeTruthy()
      expect(recap!.players.some((p) => p.id === a.playerId)).toBe(true)
    }
  }, 60_000)
})
