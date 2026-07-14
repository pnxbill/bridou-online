import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type AppInstance } from '../src/app'
import { InMemoryGameStateStore } from '../src/infra/in-memory-game-store'
import { fakeTokenVerifier, tokenFor } from './fake-verifier'

/**
 * The durability payoff: a game in progress survives a server restart. One
 * shared state store stands in for Postgres; tearing down the app and building
 * a fresh one against the same store simulates the process dying and coming
 * back. The reconnecting players find their game exactly where they left it.
 */

class RestClient {
  constructor(
    readonly playerId: string,
    private baseUrl: string,
  ) {}

  retarget(baseUrl: string): void {
    this.baseUrl = baseUrl
  }

  private async call(path: string, body?: object): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFor(this.playerId)}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, data: await res.json() }
  }

  post = (path: string, body: object) => this.call(path, body)
  enter = async (gameId: string) => (await this.call('/api/enter-game', { gameId })).data.game
}

const listen = async (app: AppInstance): Promise<string> => {
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
  return `http://localhost:${(app.httpServer.address() as AddressInfo).port}`
}

const settle = () => new Promise((r) => setTimeout(r, 25))

/** Drive bets/plays over REST until the given round number is reached (or timeout). */
const driveUntilRound = async (
  clients: RestClient[],
  gameId: string,
  round: number,
  timeoutMs = 9000,
): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const client of clients) {
      const game = await client.enter(gameId)
      if (game.currentRound.currentRoundNumber >= round) return
      if (game.availableBets.length > 0) {
        await client.post('/api/bet', { gameId, bet: game.availableBets[0] })
      } else {
        const card = game.playableCards.find((c: { disabled: boolean }) => !c.disabled)
        if (card) await client.post('/api/play-card', { gameId, card: card.value })
      }
    }
    await settle()
  }
  throw new Error(`never reached round ${round}`)
}

describe('game durability across a restart', () => {
  const store = new InMemoryGameStateStore()
  const apps: AppInstance[] = []
  // Large abandonment window so REST-only play never trips the grace timer.
  const boot = async () => {
    const app = createApp({
      tokenVerifier: fakeTokenVerifier,
      gameStore: store,
      abandonment: { debounceMs: 60_000, graceMs: 60_000 },
    })
    apps.push(app)
    return { app, baseUrl: await listen(app) }
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()))
  })

  it('reloads the in-flight game and lets play continue', async () => {
    const first = await boot()
    const alice = new RestClient('alice', first.baseUrl)
    const bob = new RestClient('bob', first.baseUrl)

    // open a lobby, seat both, start the game
    const created = await alice.post('/api/lobbies', {})
    const code = created.data.lobby.code
    const gameId = created.data.lobby.lobbyId
    await bob.post(`/api/lobbies/${code}/join`, {})
    await alice.post(`/api/lobbies/${code}/start`, {})
    await settle()

    // both place their bets, so the restart lands mid-round (a trick under way)
    const aliceBefore = await alice.enter(gameId)
    await alice.post('/api/bet', { gameId, bet: aliceBefore.availableBets[0] })
    const bobBefore = await bob.enter(gameId)
    await bob.post('/api/bet', { gameId, bet: bobBefore.availableBets[0] })
    await settle()

    const before = await alice.enter(gameId)
    expect(before.currentRound.betting).toBe(false) // betting done, playing under way

    // crash: flush pending writes and drop the process
    await apps.splice(0)[0]!.close()

    // restart against the same durable store
    const second = await boot()
    alice.retarget(second.baseUrl)
    bob.retarget(second.baseUrl)

    const after = await alice.enter(gameId)
    // the game came back exactly where it was: same round, same hand, bets intact
    expect(after.currentRound.currentRoundNumber).toBe(before.currentRound.currentRoundNumber)
    expect(after.playableCards).toEqual(before.playableCards)
    expect(after.currentRound.players.map((p: { bet: number | null }) => p.bet)).toEqual(
      before.currentRound.players.map((p: { bet: number | null }) => p.bet),
    )

    // and it stays playable through to the next round (transition re-armed)
    await driveUntilRound([alice, bob], gameId, 2)
    const round2 = await alice.enter(gameId)
    expect(round2.currentRound.currentRoundNumber).toBe(2)
  }, 20_000)
})
