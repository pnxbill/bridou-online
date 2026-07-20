import { Game, createHeuristicBot } from '@bridou/engine'
import { describe, expect, it } from 'vitest'
import { GameHistoryRecorder, trumpLeadRate } from '../src/application/game-history'
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

describe('game history persistence', () => {
  it('stores the full event log and answers trump-lead rate after a finished game', async () => {
    const history = new InMemoryGameHistoryRepository()
    const playersRepo = new InMemoryPlayerRepository()
    const recorder = new GameHistoryRecorder(history, playersRepo)

    const publisher = new RecordingPublisher()
    const scheduler = new ManualScheduler()
    const rng = seededRng(42)
    const roster = makePlayers(3)
    const game = new Game(
      { id: 'hist-1', leaderId: 'p1', players: roster },
      {
        publisher: {
          publish: (event) => {
            publisher.publish(event)
            recorder.onDomainEvent('hist-1', event)
          },
        },
        scheduler,
        rng,
      },
    )

    recorder.recordGameStarted({
      gameId: 'hist-1',
      leaderId: 'p1',
      roster,
    })

    playFullGame(game, publisher, scheduler, rng, {
      strategies: {
        p1: createHeuristicBot(),
        p2: createHeuristicBot(),
        p3: createHeuristicBot(),
      },
    })

    await recorder.flush('hist-1')

    const events = await history.getGameEvents('hist-1')
    expect(events.length).toBeGreaterThan(50)
    expect(events.some((e) => e.type === 'cards-dealt')).toBe(true)
    expect(events.some((e) => e.type === 'game-ended')).toBe(true)

    const finished = history.games.get('hist-1')
    expect(finished?.status).toBe('finished')
    expect(finished?.finalScoreboard).toHaveLength(3)
    expect(finished?.players).toHaveLength(3)

    // All-human game with no takeover counts toward the leaderboard.
    expect(finished?.ranked).toBe(true)
    const rankings = await history.getLeaderboard()
    expect(rankings).toHaveLength(3)
    expect(rankings.reduce((sum, r) => sum + r.wins, 0)).toBe(1)
    expect(rankings[0]!.wins).toBe(1)
    expect(rankings[0]!.gamesPlayed).toBe(1)
    expect(rankings[0]!.winRate).toBe(1)

    const rate = trumpLeadRate(events, 'p1')
    expect(rate.leads).toBeGreaterThan(0)
    expect(rate.trumpLeads).toBeGreaterThanOrEqual(0)
    expect(rate.rate).not.toBeNull()
    expect(rate.rate!).toBeGreaterThanOrEqual(0)
    expect(rate.rate!).toBeLessThanOrEqual(1)

    // eslint-disable-next-line no-console
    console.log(
      `p1 trump-lead rate: ${((rate.rate ?? 0) * 100).toFixed(1)}% ` +
        `(${rate.trumpLeads}/${rate.leads} leads)`,
    )
  }, 60_000)

  const finishGame = async (
    recorder: GameHistoryRecorder,
    gameId: string,
    roster: ReturnType<typeof makePlayers>,
    beforeEnd?: () => void,
  ) => {
    recorder.recordGameStarted({ gameId, leaderId: roster[0]!.id, roster })
    beforeEnd?.()
    recorder.onDomainEvent(gameId, {
      type: 'game-ended',
      scoreboard: roster.map((p, i) => ({ ...p, totalPoints: 100 - i * 10 })),
    })
    await recorder.flush(gameId)
  }

  it('excludes games with a bot seat from the ranking', async () => {
    const history = new InMemoryGameHistoryRepository()
    const recorder = new GameHistoryRecorder(history, new InMemoryPlayerRepository())

    const roster = makePlayers(3)
    roster[2] = { ...roster[2]!, isBot: true }
    await finishGame(recorder, 'bot-seat', roster)

    expect(history.games.get('bot-seat')?.ranked).toBe(false)
    expect(await history.getLeaderboard()).toHaveLength(0)
  })

  it('excludes games where a bot took over mid-game', async () => {
    const history = new InMemoryGameHistoryRepository()
    const recorder = new GameHistoryRecorder(history, new InMemoryPlayerRepository())

    const roster = makePlayers(3)
    await finishGame(recorder, 'takeover', roster, () => {
      recorder.onDomainEvent('takeover', { type: 'bot-took-over', playerId: roster[1]!.id })
    })

    expect(history.games.get('takeover')?.ranked).toBe(false)
    expect(await history.getLeaderboard()).toHaveLength(0)
  })

  it('aggregates wins and win rate across multiple ranked games', async () => {
    const history = new InMemoryGameHistoryRepository()
    const recorder = new GameHistoryRecorder(history, new InMemoryPlayerRepository())
    const roster = makePlayers(2)

    await finishGame(recorder, 'g1', roster)
    await finishGame(recorder, 'g2', roster)
    await finishGame(recorder, 'g3', [...roster].reverse())

    const rankings = await history.getLeaderboard()
    expect(rankings.map((r) => r.playerId)).toEqual([roster[0]!.id, roster[1]!.id])
    expect(rankings[0]).toMatchObject({ gamesPlayed: 3, wins: 2 })
    expect(rankings[0]!.winRate).toBeCloseTo(2 / 3)
    expect(rankings[1]).toMatchObject({ gamesPlayed: 3, wins: 1 })
  })
})
