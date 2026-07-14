import type { DomainEvent, PlayerInfo } from '@bridou/shared'
import type { Scheduler } from '@bridou/engine'
import { beforeEach, describe, expect, it } from 'vitest'
import { AbandonmentService } from '../src/application/abandonment'
import { GameService } from '../src/application/game-service'
import { LobbyRegistry } from '../src/application/lobby'
import { PresenceTracker } from '../src/application/presence'
import type { RealtimeGateway } from '../src/application/ports'
import { InMemoryGameRepository } from '../src/infra/in-memory-game-repository'
import { InterceptingGateway } from '../src/infra/intercepting-gateway'

class RecordingGateway implements RealtimeGateway {
  events: { gameId: string; event: DomainEvent }[] = []

  publisherFor(gameId: string) {
    return { publish: (event: DomainEvent) => this.events.push({ gameId, event }) }
  }

  lobbyUpdated(): void {}
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
    service = new GameService(games, new LobbyRegistry(), intercepting, abandonment, {
      scheduler,
    })
    abandonment.bind({ gateway: intercepting, actions: service })

    const { code, lobbyId } = service.createLobby(player('alice'))
    service.joinLobby(code, player('bob'))
    gameId = lobbyId
    presence.connected(gameId, 'alice', 'conn-alice')
    presence.connected(gameId, 'bob', 'conn-bob')
    service.startGame(code, 'alice')
  })

  const disconnectBob = () => {
    presence.disconnected('conn-bob')
    scheduler.flush() // debounce timer fires → abandonment declared
  }

  it('declares abandonment after the debounce and pauses the game', async () => {
    disconnectBob()

    const abandoned = gateway.ofType('player-abandoned')
    expect(abandoned).toHaveLength(1)
    expect(abandoned[0]).toMatchObject({ playerId: 'bob', resumeAt: 1_000_000 + GRACE })

    expect(() => service.placeBet(gameId, 'alice', 0)).toThrow('Game is paused')
    expect((await service.enterGame(gameId, 'alice')).abandoned).toHaveLength(1)
  })

  it('ignores short blips: reconnect within the debounce emits nothing', () => {
    presence.disconnected('conn-bob')
    presence.connected(gameId, 'bob', 'conn-bob-2')
    scheduler.flushAll()

    expect(gateway.ofType('player-abandoned')).toHaveLength(0)
    expect(() => service.placeBet(gameId, 'alice', 0)).not.toThrow()
  })

  it('returns the seat when the player comes back during grace', async () => {
    disconnectBob()
    presence.connected(gameId, 'bob', 'conn-bob-2')

    expect(gateway.ofType('player-rejoined')).toHaveLength(1)
    expect(() => service.placeBet(gameId, 'alice', 0)).not.toThrow()

    // the pending takeover timer must be stale now
    scheduler.flushAll()
    expect(gateway.ofType('bot-took-over')).toHaveLength(0)
    expect((await service.enterGame(gameId, 'alice')).botSeats).toEqual([])
  })

  it('hands the seat to the bot when the grace expires, and the bot finishes the round', async () => {
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
    expect((await service.enterGame(gameId, 'alice')).botSeats).toEqual(['bob'])
  })

  it('gives the seat back to a returning player after a bot takeover', async () => {
    disconnectBob()
    scheduler.flush() // grace → takeover
    expect(gateway.ofType('bot-took-over')).toHaveLength(1)

    presence.connected(gameId, 'bob', 'conn-bob-2')
    expect(gateway.ofType('player-rejoined')).toHaveLength(1)
    expect((await service.enterGame(gameId, 'bob')).botSeats).toEqual([])
  })

  it('ignores disconnects that have no game (queue page, strangers)', () => {
    presence.connected('some-queue', 'carol', 'conn-carol')
    presence.disconnected('conn-carol')
    scheduler.flushAll()

    expect(gateway.ofType('player-abandoned')).toHaveLength(0)
  })

  it('plays a lobby bot from the very first move', async () => {
    // fresh lobby: carol + a seated bot (the alice/bob game from beforeEach is separate)
    const { code, lobbyId: botGameId } = service.createLobby(player('carol'))
    const { bot } = service.addBotToLobby(code, 'carol')
    expect(bot.isBot).toBe(true)
    expect(bot.name).toBeTruthy()

    presence.connected(botGameId, 'carol', 'conn-carol')
    service.startGame(code, 'carol')

    // round 1: carol (leader) bets first, then the bot is prompted; flush its think timers
    service.placeBet(botGameId, 'carol', 0)
    scheduler.flushAll()
    const botBet = gateway
      .ofType('player-bet')
      .find((e) => e.playerId === bot.id)
    expect(botBet).toBeDefined()

    // snapshot marks the seat as bot for reconnecting clients
    const entry = await service.enterGame(botGameId, 'carol')
    expect(entry.botSeats).toContain(bot.id)
    expect(entry.currentRound.players.find((p) => p.id === bot.id)?.isBot).toBe(true)
  })

  it('keeps the game paused until every abandoned seat is resolved', async () => {
    presence.disconnected('conn-alice')
    presence.disconnected('conn-bob')
    scheduler.flush() // both debounces fire
    expect(gateway.ofType('player-abandoned')).toHaveLength(2)

    presence.connected(gameId, 'alice', 'conn-alice-2')
    expect(() => service.placeBet(gameId, 'alice', 0)).toThrow('Game is paused')

    scheduler.flushAll() // bob's grace expires → bot seat → game resumes
    expect(gateway.ofType('bot-took-over')).toHaveLength(1)
    const state = await service.enterGame(gameId, 'alice')
    expect(state.abandoned).toEqual([])
    expect(state.botSeats).toEqual(['bob'])
  })
})

describe('abandonment reconciliation after a reload', () => {
  it('restores bot seats and gives absent humans grace, sparing reconnected ones', () => {
    // A game already in the repo, as if just rehydrated after a restart.
    const games = new InMemoryGameRepository()
    const bootstrap = new AbandonmentService({ games, scheduler: new ManualScheduler() })
    const seed = new GameService(
      games,
      new LobbyRegistry(),
      new InterceptingGateway(new RecordingGateway(), (g, e) => bootstrap.onDomainEvent(g, e)),
      bootstrap,
      { scheduler: new ManualScheduler() },
    )
    const { code, lobbyId } = seed.createLobby(player('alice'))
    seed.joinLobby(code, player('bob'))
    const { bot } = seed.addBotToLobby(code, 'alice')
    seed.startGame(code, 'alice')
    const game = games.get(lobbyId)!

    // Fresh wiring with empty session maps — the "restarted" server.
    const gateway = new RecordingGateway()
    const scheduler = new ManualScheduler()
    const abandonment = new AbandonmentService({
      games,
      scheduler,
      now: () => 2_000_000,
      debounceMs: DEBOUNCE,
      graceMs: GRACE,
    })
    const intercepting = new InterceptingGateway(gateway, (g, e) => abandonment.onDomainEvent(g, e))
    const service = new GameService(games, new LobbyRegistry(), intercepting, abandonment, {
      scheduler,
    })
    abandonment.bind({ gateway: intercepting, actions: service })
    const presence = new PresenceTracker(abandonment)

    // alice reconnects before reconciliation; bob does not.
    presence.connected(lobbyId, 'alice', 'conn-alice-2')
    abandonment.reconcileAfterLoad(game, [bot.id])

    // the bot seat is known again immediately
    expect(abandonment.sessionState(lobbyId).botSeats).toContain(bot.id)

    scheduler.flushAll()
    const abandoned = gateway.ofType('player-abandoned').map((e) => e.playerId)
    expect(abandoned).toContain('bob') // absent → grace → taken over
    expect(abandoned).not.toContain('alice') // reconnected → spared
    expect(abandonment.sessionState(lobbyId).botSeats).toContain('bob')
  })
})
