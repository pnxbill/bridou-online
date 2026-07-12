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
})
