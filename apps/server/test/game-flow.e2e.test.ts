import type { DomainEvent } from '@bridou/shared'
import type { AddressInfo } from 'node:net'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type AppInstance } from '../src/app'

/**
 * Exercises the real contract the web client relies on — REST endpoints,
 * queue events, and the DomainEvent stream with private routing — once per
 * transport, since both socket.io and SSE are live until one wins.
 */

type Transport = 'socketio' | 'sse'

class FakeClient {
  events: DomainEvent[] = []
  queueJoins: unknown[] = []
  gameStarted = 0
  private socket?: Socket
  private abort?: AbortController

  constructor(
    readonly playerId: string,
    private readonly baseUrl: string,
    private readonly transport: Transport,
  ) {}

  async connect(gameId: string): Promise<void> {
    if (this.transport === 'socketio') {
      this.socket = connectSocket(this.baseUrl, {
        auth: { gameId, playerId: this.playerId },
      })
      this.socket.onAny((name: string, payload: unknown) => this.route(name, payload))
      await new Promise<void>((resolve) => this.socket!.on('connect', () => resolve()))
      return
    }

    this.abort = new AbortController()
    const res = await fetch(
      `${this.baseUrl}/api/games/${gameId}/events?playerId=${this.playerId}`,
      { signal: this.abort.signal },
    )
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    void this.readSseStream(res.body!)
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.abort?.abort()
  }

  ofType<T extends DomainEvent['type']>(type: T): Extract<DomainEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type)
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

  private route(name: string, payload: unknown): void {
    if (name === 'event') this.events.push(payload as DomainEvent)
    if (name === 'player-entered-queue') this.queueJoins.push(payload)
    if (name === 'game-started') this.gameStarted++
  }

  /** Minimal SSE parser: frames split on blank lines, `data:` lines carry the envelope. */
  private async readSseStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })

        let boundary
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('')
          if (!data) continue
          const { name, payload } = JSON.parse(data) as { name: string; payload?: unknown }
          this.route(name, payload)
        }
      }
    } catch {
      // stream aborted on disconnect
    }
  }
}

const waitFor = async (predicate: () => boolean, what: string, timeoutMs = 5000): Promise<void> => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${what}`)
    await new Promise((r) => setTimeout(r, 15))
  }
}

describe.each<Transport>(['socketio', 'sse'])('game flow over %s', (transport) => {
  let app: AppInstance
  let baseUrl: string
  let alice: FakeClient
  let bob: FakeClient
  let gameId: string

  beforeAll(async () => {
    app = createApp()
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
    baseUrl = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`
    alice = new FakeClient('alice', baseUrl, transport)
    bob = new FakeClient('bob', baseUrl, transport)
  })

  afterAll(async () => {
    alice?.disconnect()
    bob?.disconnect()
    await app.close()
  })

  it('queues players and notifies the queue room', async () => {
    const res = await alice.post('/api/enter-queue', { user: { id: 'alice', name: 'Alice' } })
    expect(res.status).toBe(200)
    expect(res.data.leaderId).toBe('alice')
    gameId = res.data.queueId
    await alice.connect(gameId)

    await bob.post('/api/enter-queue', { user: { id: 'bob', name: 'Bob' } })
    await bob.connect(gameId)

    await waitFor(() => alice.queueJoins.length === 1, 'alice sees bob join')
    const queue = await alice.get('/api/queue')
    expect(queue.data.queue.map((p: any) => p.id)).toEqual(['alice', 'bob'])
  })

  it('starts the game and streams the round-start events, hands kept private', async () => {
    await alice.get('/api/start-game')

    await waitFor(
      () =>
        [alice, bob].every(
          (c) =>
            c.gameStarted === 1 &&
            c.ofType('round-started').length === 1 &&
            c.ofType('cards-dealt').length === 1,
        ),
      'both players get the round-start sequence',
    )

    // each player receives only their own hand
    expect(alice.ofType('cards-dealt')[0]!.playerId).toBe('alice')
    expect(bob.ofType('cards-dealt')[0]!.playerId).toBe('bob')

    // broadcast snapshots never contain hands
    const round = alice.ofType('round-started')[0]!.round
    round.players.forEach((p) => expect(p).not.toHaveProperty('cards'))

    // alice leads round 1: only she is asked to bet
    await waitFor(() => alice.ofType('bet-requested').length === 1, 'alice asked to bet')
    expect(bob.ofType('bet-requested')).toHaveLength(0)
  })

  it('serves the reconnect snapshot and rejects strangers', async () => {
    const res = await alice.post('/api/enter-game', { gameId, playerId: 'alice' })
    expect(res.status).toBe(200)
    expect(res.data.game.currentRound.players).toHaveLength(2)
    expect(res.data.game.availableBets.length).toBeGreaterThan(0)

    const stranger = await alice.post('/api/enter-game', { gameId, playerId: 'nobody' })
    expect(stranger.status).toBe(403)
    const missing = await alice.post('/api/enter-game', { gameId: 'nope', playerId: 'alice' })
    expect(missing.status).toBe(404)
  })

  it('plays a whole round driven by the event stream', async () => {
    await alice.post('/api/bet', { gameId, playerId: 'alice', bet: 0 })
    await waitFor(() => bob.ofType('bet-requested').length === 1, 'bob asked to bet')
    const bobBets = bob.ofType('bet-requested')[0]!.availableBets
    await bob.post('/api/bet', { gameId, playerId: 'bob', bet: bobBets[0]! })

    await waitFor(() => alice.ofType('play-requested').length === 1, 'alice asked to play')
    const aliceCard = alice.ofType('play-requested')[0]!.cards.find((c) => !c.disabled)!
    await alice.post('/api/play-card', { gameId, playerId: 'alice', card: aliceCard.value })

    await waitFor(() => bob.ofType('play-requested').length === 1, 'bob asked to play')
    const bobCard = bob.ofType('play-requested')[0]!.cards.find((c) => !c.disabled)!
    await bob.post('/api/play-card', { gameId, playerId: 'bob', card: bobCard.value })

    await waitFor(
      () => [alice, bob].every((c) => c.ofType('round-ended').length === 1),
      'the round ends',
    )
    expect(alice.ofType('card-played')).toHaveLength(2)
  })

  it('starts round 2 with the table rotated after the transition delay', async () => {
    await waitFor(() => alice.ofType('round-started').length === 2, 'round 2 starts', 6000)
    const round2 = alice.ofType('round-started')[1]!.round
    expect(round2.cardsForEachPlayer).toBe(2)
    expect(round2.players[0]!.id).toBe('bob')
  }, 10_000)
})
