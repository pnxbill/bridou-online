import type { AddressInfo } from 'node:net'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type AppInstance } from '../src/app'

/**
 * Talks to the server exactly like the existing Qwik client does — same REST
 * endpoints, same socket handshake — and asserts the legacy socket event
 * names and payload shapes still arrive. This is the contract that keeps the
 * current frontend working until the Next.js port lands.
 */

type ReceivedEvent = { name: string; payload: unknown }

const LEGACY_EVENTS = [
  'player-entered-queue',
  'game-started',
  'round-started',
  'set-trunfo',
  'cards',
  'bet-time',
  'player-bet',
  'turn-started',
  'play-time',
  'player-play',
  'turn-ended',
  'round-ended',
  'scoreboard',
  'close-scoreboard',
]

class FakeClient {
  received: ReceivedEvent[] = []
  /** The clean contract on the 'event' channel — what the Next.js client consumes. */
  domainEvents: { type: string; playerId?: string }[] = []
  private socket!: Socket

  constructor(
    readonly playerId: string,
    private readonly baseUrl: string,
  ) {}

  async connectSocket(gameId: string): Promise<void> {
    this.socket = connect(this.baseUrl, { auth: { gameId, playerId: this.playerId } })
    LEGACY_EVENTS.forEach((name) => {
      this.socket.on(name, (payload: unknown) => this.received.push({ name, payload }))
    })
    this.socket.on('event', (event: { type: string; playerId?: string }) => {
      this.domainEvents.push(event)
    })
    await new Promise<void>((resolve) => this.socket.on('connect', () => resolve()))
  }

  disconnect(): void {
    this.socket?.disconnect()
  }

  ofType(name: string): ReceivedEvent[] {
    return this.received.filter((e) => e.name === name)
  }

  async post(path: string, body: object): Promise<{ status: number; data: any }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, data: await res.json() }
  }

  async get(path: string): Promise<{ status: number; data: any }> {
    const res = await fetch(`${this.baseUrl}${path}`)
    return { status: res.status, data: await res.json() }
  }
}

const waitFor = async (predicate: () => boolean, what: string, timeoutMs = 5000): Promise<void> => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${what}`)
    await new Promise((r) => setTimeout(r, 15))
  }
}

describe('legacy wire protocol', () => {
  let app: AppInstance
  let baseUrl: string
  let alice: FakeClient
  let bob: FakeClient

  beforeAll(async () => {
    app = createApp()
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
    baseUrl = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`
    alice = new FakeClient('alice', baseUrl)
    bob = new FakeClient('bob', baseUrl)
  })

  afterAll(async () => {
    alice?.disconnect()
    bob?.disconnect()
    app.io.close()
    await new Promise<void>((resolve) => app.httpServer.close(() => resolve()))
  })

  let gameId: string

  it('queues players over REST and notifies the queue room', async () => {
    const res = await alice.post('/api/enter-queue', {
      user: { id: 'alice', name: 'Alice' },
    })
    expect(res.status).toBe(200)
    expect(res.data.message).toBe('ok')
    expect(res.data.leaderId).toBe('alice')
    gameId = res.data.queueId

    await alice.connectSocket(gameId)

    const bobRes = await bob.post('/api/enter-queue', { user: { id: 'bob', name: 'Bob' } })
    expect(bobRes.data.queueId).toBe(gameId)
    await bob.connectSocket(gameId)

    await waitFor(() => alice.ofType('player-entered-queue').length === 1, "alice sees bob join")
    expect(alice.ofType('player-entered-queue')[0]!.payload).toMatchObject({
      id: 'bob',
      name: 'Bob',
    })

    const queue = await alice.get('/api/queue')
    expect(queue.data.queue.map((p: any) => p.id)).toEqual(['alice', 'bob'])
  })

  it('starts the game and pushes the round-start sequence', async () => {
    const res = await alice.get('/api/start-game')
    expect(res.data.gameId).toBe(gameId)

    await waitFor(
      () =>
        [alice, bob].every(
          (c) =>
            c.ofType('game-started').length === 1 &&
            c.ofType('round-started').length === 1 &&
            c.ofType('set-trunfo').length === 1 &&
            c.ofType('cards').length === 1,
        ),
      'both players receive the round-start sequence',
    )

    // round 1 deals exactly one card, privately
    expect(alice.ofType('cards')[0]!.payload).toHaveLength(1)
    expect(bob.ofType('cards')[0]!.payload).toHaveLength(1)
    expect(alice.ofType('cards')[0]!.payload).not.toEqual(bob.ofType('cards')[0]!.payload)

    // broadcast snapshots never contain hands
    const round = alice.ofType('round-started')[0]!.payload as any
    expect(round.cardsForEachPlayer).toBe(1)
    round.players.forEach((p: any) => expect(p).not.toHaveProperty('cards'))

    // alice bets first (she leads round 1)
    await waitFor(() => alice.ofType('bet-time').length === 1, 'alice is asked to bet')
    expect(bob.ofType('bet-time')).toHaveLength(0)

    // the DomainEvent channel (consumed by the Next.js client) carries the same flow,
    // with private events routed only to their owner
    const aliceTypes = alice.domainEvents.map((e) => e.type)
    expect(aliceTypes).toEqual(
      expect.arrayContaining(['round-started', 'trunfo-set', 'cards-dealt', 'bet-requested']),
    )
    const privateTypes = ['cards-dealt', 'bet-requested', 'play-requested']
    const bobPrivate = bob.domainEvents.filter((e) => privateTypes.includes(e.type))
    expect(bobPrivate.every((e) => e.playerId === 'bob')).toBe(true)
    expect(bob.domainEvents.some((e) => e.type === 'bet-requested')).toBe(false)
  })

  it('returns the reconnect snapshot from /api/enter-game', async () => {
    const res = await alice.post('/api/enter-game', { gameId, playerId: 'alice' })
    expect(res.status).toBe(200)

    const game = res.data.game
    expect(game.leaderId).toBe('alice')
    expect(game.currentRound.trunfo).toBeTruthy()
    expect(game.currentRound.players).toHaveLength(2)
    expect(game.availableBets.length).toBeGreaterThan(0)
    expect(game.playableCards).toHaveLength(1)
    expect(game.scoreboard).toHaveLength(2)

    const stranger = await alice.post('/api/enter-game', { gameId, playerId: 'nobody' })
    expect(stranger.data.message).toBe("You're not in this game")
    const missing = await alice.post('/api/enter-game', { gameId: 'nope', playerId: 'alice' })
    expect(missing.status).toBe(404)
    expect(missing.data.message).toBe('Game not found')
  })

  it('walks betting and playing through a whole round', async () => {
    await alice.post('/api/bet', { gameId, playerId: 'alice', bet: 0 })
    await waitFor(
      () => [alice, bob].every((c) => c.ofType('player-bet').length === 1),
      'both see the first bet',
    )
    expect(alice.ofType('player-bet')[0]!.payload).toEqual({ id: 'alice', bet: 0 })

    await waitFor(() => bob.ofType('bet-time').length === 1, 'bob is asked to bet')
    const bobBets = bob.ofType('bet-time')[0]!.payload as number[]
    await bob.post('/api/bet', { gameId, playerId: 'bob', bet: bobBets[0]! })

    await waitFor(
      () => [alice, bob].every((c) => c.ofType('turn-started').length === 1),
      'the first trick starts',
    )
    await waitFor(() => alice.ofType('play-time').length === 1, 'alice is asked to play')

    const aliceCard = (alice.ofType('play-time')[0]!.payload as any[])[0]
    expect(aliceCard.disabled).toBe(false)
    await alice.post('/api/play-card', { gameId, playerId: 'alice', card: aliceCard.value })

    await waitFor(() => bob.ofType('play-time').length === 1, 'bob is asked to play')
    const bobCard = (bob.ofType('play-time')[0]!.payload as any[])[0]
    await bob.post('/api/play-card', { gameId, playerId: 'bob', card: bobCard.value })

    await waitFor(
      () =>
        [alice, bob].every(
          (c) => c.ofType('turn-ended').length === 1 && c.ofType('round-ended').length === 1,
        ),
      'the trick and round end',
    )
    expect(alice.ofType('player-play')).toHaveLength(2)

    const rejected = await alice.post('/api/bet', { gameId, playerId: 'alice', bet: 0 })
    expect(rejected.status).toBe(400)
  })

  it('starts round 2 after the transition delay', async () => {
    await waitFor(
      () => alice.ofType('round-started').length === 2,
      'round 2 starts automatically',
      6000,
    )
    const round2 = alice.ofType('round-started')[1]!.payload as any
    expect(round2.cardsForEachPlayer).toBe(2)
    // bob leads round 2 — the table rotated
    expect(round2.players[0].id).toBe('bob')
  }, 10_000)
})
