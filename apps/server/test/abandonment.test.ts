import type { DomainEvent, PlayerInfo } from '@bridou/shared'
import type { Scheduler } from '@bridou/engine'
import { beforeEach, describe, expect, it } from 'vitest'
import { AbandonmentService } from '../src/application/abandonment'
import { GameService } from '../src/application/game-service'
import { PresenceTracker } from '../src/application/presence'
import { Queue } from '../src/application/queue'
import type { RealtimeGateway } from '../src/application/ports'
import { InMemoryGameRepository } from '../src/infra/in-memory-game-repository'
import { InterceptingGateway } from '../src/infra/intercepting-gateway'

class RecordingGateway implements RealtimeGateway {
  events: { gameId: string; event: DomainEvent }[] = []

  publisherFor(gameId: string) {
    return { publish: (event: DomainEvent) => this.events.push({ gameId, event }) }
  }

  playerJoinedQueue(): void {}
  gameStarted(): void {}

  ofType<T extends DomainEvent['type']>(type: T): Extract<DomainEvent, { type: T }>[] {
    return this.events
      .map((e) => e.event)
      .filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type)
  }
}

/** Runs due callbacks only when told to, tracking requested delays. */
class ManualScheduler implements Scheduler {
  pending: { fn: () => void; delayMs: number }[] = []

  schedule(fn: () => void, delayMs: number): void {
    this.pending.push({ fn, delayMs })
  }

  flush(): void {
    const batch = this.pending
    this.pending = []
    batch.forEach(({ fn }) => fn())
  }

  flushAll(limit = 50): void {
    while (this.pending.length) {
      if (--limit === 0) throw new Error('scheduler never settles')
      this.flush()
    }
  }
}

const player = (id: string): PlayerInfo => ({ id, name: `Player ${id}` })

const DEBOUNCE = 3000
const GRACE = 30_000

describe('abandonment flow', () => {
  let gateway: RecordingGateway
  let scheduler: ManualScheduler
  let service: GameService
  let abandonment: AbandonmentService
  let presence: PresenceTracker
  let gameId: string

  beforeEach(() => {
    gateway = new RecordingGateway()
    scheduler = new ManualScheduler()
    const games = new InMemoryGameRepository()
    abandonment = new AbandonmentService({
      games,
      scheduler,
      now: () => 1_000_000,
      debounceMs: DEBOUNCE,
      graceMs: GRACE,
      botThinkMs: 500,
    })
    presence = new PresenceTracker(abandonment)
    const intercepting = new InterceptingGateway(gateway, (g, e) =>
      abandonment.onDomainEvent(g, e),
    )
    service = new GameService(games, new Queue(), intercepting, abandonment, { scheduler })
    abandonment.bind({ gateway: intercepting, actions: service })

    const { queueId } = service.joinQueue(player('alice'))
    service.joinQueue(player('bob'))
    gameId = queueId
    presence.connected(gameId, 'alice', 'conn-alice')
    presence.connected(gameId, 'bob', 'conn-bob')
    service.startGame()
  })

  const disconnectBob = () => {
    presence.disconnected('conn-bob')
    scheduler.flush() // debounce timer fires → abandonment declared
  }

  it('declares abandonment after the debounce and pauses the game', () => {
    disconnectBob()

    const abandoned = gateway.ofType('player-abandoned')
    expect(abandoned).toHaveLength(1)
    expect(abandoned[0]).toMatchObject({ playerId: 'bob', resumeAt: 1_000_000 + GRACE })

    expect(() => service.placeBet(gameId, 'alice', 0)).toThrow('Game is paused')
    expect(service.enterGame(gameId, 'alice').abandoned).toHaveLength(1)
  })

  it('ignores short blips: reconnect within the debounce emits nothing', () => {
    presence.disconnected('conn-bob')
    presence.connected(gameId, 'bob', 'conn-bob-2')
    scheduler.flushAll()

    expect(gateway.ofType('player-abandoned')).toHaveLength(0)
    expect(() => service.placeBet(gameId, 'alice', 0)).not.toThrow()
  })

  it('returns the seat when the player comes back during grace', () => {
    disconnectBob()
    presence.connected(gameId, 'bob', 'conn-bob-2')

    expect(gateway.ofType('player-rejoined')).toHaveLength(1)
    expect(() => service.placeBet(gameId, 'alice', 0)).not.toThrow()

    // the pending takeover timer must be stale now
    scheduler.flushAll()
    expect(gateway.ofType('bot-took-over')).toHaveLength(0)
    expect(service.enterGame(gameId, 'alice').botSeats).toEqual([])
  })

  it('hands the seat to the bot when the grace expires, and the bot finishes the round', () => {
    // alice (leader) bets first, then bob disconnects
    service.placeBet(gameId, 'alice', 0)
    disconnectBob()
    scheduler.flushAll() // grace expires → takeover → bot bets and plays when prompted

    expect(gateway.ofType('bot-took-over')).toHaveLength(1)
    const botBet = gateway.ofType('player-bet').find((e) => e.playerId === 'bob')
    expect(botBet).toBeDefined()

    // round 1 has one trick; alice still needs to play her card
    const alicePrompt = gateway.ofType('play-requested').find((e) => e.playerId === 'alice')
    if (alicePrompt) {
      const card = alicePrompt.cards.find((c) => !c.disabled)
      if (card) service.playCard(gameId, 'alice', card.value)
    }
    scheduler.flushAll()

    expect(gateway.ofType('round-ended')).toHaveLength(1)
    expect(service.enterGame(gameId, 'alice').botSeats).toEqual(['bob'])
  })

  it('gives the seat back to a returning player after a bot takeover', () => {
    disconnectBob()
    scheduler.flush() // grace → takeover
    expect(gateway.ofType('bot-took-over')).toHaveLength(1)

    presence.connected(gameId, 'bob', 'conn-bob-2')
    expect(gateway.ofType('player-rejoined')).toHaveLength(1)
    expect(service.enterGame(gameId, 'bob').botSeats).toEqual([])
  })

  it('ignores disconnects that have no game (queue page, strangers)', () => {
    presence.connected('some-queue', 'carol', 'conn-carol')
    presence.disconnected('conn-carol')
    scheduler.flushAll()

    expect(gateway.ofType('player-abandoned')).toHaveLength(0)
  })

  it('keeps the game paused until every abandoned seat is resolved', () => {
    presence.disconnected('conn-alice')
    presence.disconnected('conn-bob')
    scheduler.flush() // both debounces fire
    expect(gateway.ofType('player-abandoned')).toHaveLength(2)

    presence.connected(gameId, 'alice', 'conn-alice-2')
    expect(() => service.placeBet(gameId, 'alice', 0)).toThrow('Game is paused')

    scheduler.flushAll() // bob's grace expires → bot seat → game resumes
    expect(gateway.ofType('bot-took-over')).toHaveLength(1)
    const state = service.enterGame(gameId, 'alice')
    expect(state.abandoned).toEqual([])
    expect(state.botSeats).toEqual(['bob'])
  })
})
