import type { DomainEvent } from '@bridou/shared'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type AppInstance } from '../src/app'

/**
 * End-to-end abandonment over SSE (which also exercises stream-close
 * presence detection): a player drops, the game pauses and announces it,
 * the bot takes the seat after the grace and the round finishes.
 * Timings are shrunk via AppOptions to keep the test fast.
 */

class SseClient {
  events: DomainEvent[] = []
  private abort = new AbortController()

  constructor(
    readonly playerId: string,
    private readonly baseUrl: string,
  ) {}

  async connect(gameId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/games/${gameId}/events?playerId=${this.playerId}`,
      { signal: this.abort.signal },
    )
    void this.read(res.body!)
  }

  disconnect(): void {
    this.abort.abort()
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

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
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
          if (name === 'event') this.events.push(payload as DomainEvent)
        }
      }
    } catch {
      // aborted
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

describe('abandonment over SSE', () => {
  let app: AppInstance
  let baseUrl: string
  let alice: SseClient
  let bob: SseClient
  let gameId: string

  beforeAll(async () => {
    app = createApp({ abandonment: { debounceMs: 50, graceMs: 250, botThinkMs: 20 } })
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
    baseUrl = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`
    alice = new SseClient('alice', baseUrl)
    bob = new SseClient('bob', baseUrl)
  })

  afterAll(async () => {
    alice?.disconnect()
    bob?.disconnect()
    await app.close()
  })

  it('pauses, announces, hands the seat to the bot and finishes the round', async () => {
    const res = await alice.post('/api/lobbies', { user: { id: 'alice', name: 'Alice' } })
    gameId = res.data.lobby.lobbyId
    const code = res.data.lobby.code
    await bob.post(`/api/lobbies/${code}/join`, { user: { id: 'bob', name: 'Bob' } })
    await alice.connect(gameId)
    await bob.connect(gameId)
    await alice.post(`/api/lobbies/${code}/start`, { playerId: 'alice' })

    // alice (leader) bets, then bob walks away
    await waitFor(() => alice.ofType('bet-requested').length === 1, 'alice asked to bet')
    await alice.post('/api/bet', { gameId, playerId: 'alice', bet: 0 })
    bob.disconnect()

    // others are told, and the game is paused meanwhile
    await waitFor(() => alice.ofType('player-abandoned').length === 1, 'abandonment announced')
    expect(alice.ofType('player-abandoned')[0]).toMatchObject({ playerId: 'bob' })
    const rejected = await alice.post('/api/play-card', {
      gameId,
      playerId: 'alice',
      card: 'A-♠️',
    })
    expect(rejected.status).toBe(400)
    expect(rejected.data.message).toContain('paused')

    // grace expires → bot takes the seat and bets for bob
    await waitFor(() => alice.ofType('bot-took-over').length === 1, 'bot takes over')
    await waitFor(
      () => alice.ofType('player-bet').some((e) => e.playerId === 'bob'),
      'bot bets for bob',
    )

    // alice plays her card; the bot answers and the round ends
    await waitFor(() => alice.ofType('play-requested').length === 1, 'alice asked to play')
    const card = alice.ofType('play-requested')[0]!.cards.find((c) => !c.disabled)!
    await alice.post('/api/play-card', { gameId, playerId: 'alice', card: card.value })

    await waitFor(() => alice.ofType('round-ended').length === 1, 'round finishes with the bot')
    expect(alice.ofType('card-played').map((e) => e.playerId)).toContain('bob')

    // reconnect snapshot reflects the bot seat
    const snapshot = await alice.post('/api/enter-game', { gameId, playerId: 'alice' })
    expect(snapshot.data.game.botSeats).toEqual(['bob'])
    expect(snapshot.data.game.abandoned).toEqual([])
  })
})
