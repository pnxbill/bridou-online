import { DAILY_CARDS, isPrivateEvent, type DailyState, type DomainEvent } from '@bridou/shared'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type AppInstance } from '../src/app'
import { fakeTokenVerifier, tokenFor } from './fake-verifier'

/**
 * The Mão do Dia over HTTP, as the browser plays it: read the table, call a
 * bet, land five cards, get a score.
 *
 * The point of doing this end-to-end rather than against `DailyHandService` is
 * everything between: that the attempt is opened once and only once, that the
 * hand resumes from storage rather than from a session, that a forged card is
 * refused, and that each response carries the events the client is supposed to
 * animate.
 */

interface DailyBody {
  daily: DailyState
  events: DomainEvent[]
}

describe('mão do dia over HTTP', () => {
  let app: AppInstance
  let baseUrl: string

  const call = async (
    playerId: string,
    path: string,
    body?: object,
  ): Promise<{ status: number; data: DailyBody & { message: string } }> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFor(playerId)}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, data: (await res.json()) as DailyBody & { message: string } }
  }

  beforeAll(async () => {
    app = createApp({ tokenVerifier: fakeTokenVerifier })
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
    baseUrl = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await app.close()
  })

  it('refuses to show the day to a stranger', async () => {
    const res = await fetch(`${baseUrl}/api/daily`)
    expect(res.status).toBe(401)
  })

  it('opens on a dealt hand waiting for a bet, and nothing else', async () => {
    const { data } = await call('ana', '/api/daily')
    const { table, result, leaderboard } = data.daily

    expect(table.betting).toBe(true)
    expect(table.complete).toBe(false)
    expect(table.playableCards).toHaveLength(DAILY_CARDS)
    expect(table.availableBets).toEqual([0, 1, 2, 3, 4, 5])
    expect(result).toBeNull()
    expect(leaderboard).toEqual([])
    // a page load has nothing to replay — the snapshot already holds it
    expect(data.events).toEqual([])
  })

  it('deals the same hand to everybody', async () => {
    const ana = await call('ana', '/api/daily')
    const bruno = await call('bruno', '/api/daily')
    expect(bruno.data.daily.table.playableCards).toEqual(ana.data.daily.table.playableCards)
    expect(bruno.data.daily.table.snapshot.currentRound.trunfo).toBe(
      ana.data.daily.table.snapshot.currentRound.trunfo,
    )
  })

  it('plays a whole hand: bet, five cards, a score', async () => {
    const opened = await call('ana', '/api/daily/bet', { bet: 2 })
    expect(opened.status).toBe(200)
    expect(opened.data.daily.table.betting).toBe(false)
    // the bots' bets and the opening trick are handed back to be animated
    expect(opened.data.events.filter((e) => e.type === 'player-bet')).toHaveLength(4)
    expect(opened.data.events.some((e) => e.type === 'turn-started')).toBe(true)

    let body = opened.data
    for (let trick = 0; trick < DAILY_CARDS; trick++) {
      const mine = body.daily.table.playableCards.filter((c) => !c.disabled)
      expect(mine.length).toBeGreaterThan(0)
      const played = await call('ana', '/api/daily/play', { card: mine[0]!.value })
      expect(played.status).toBe(200)
      body = played.data
    }

    expect(body.daily.table.complete).toBe(true)
    const result = body.daily.result
    expect(result).not.toBeNull()
    expect(result!.bet).toBe(2)
    expect(result!.trickWins).toHaveLength(DAILY_CARDS)
    expect(result!.made).toBe(result!.trickWins.filter(Boolean).length)
    expect(result!.exact).toBe(result!.made === 2)
    expect(result!.points).toBe(result!.exact ? 10 + result!.made : -1)
    // par is only worth knowing once you can't act on it
    expect(result!.par).toBeGreaterThanOrEqual(result!.points)

    // and the day now counts
    expect(body.daily.streak).toBe(1)
    expect(body.daily.leaderboard.map((r) => r.id)).toContain('ana')
  })

  it('never leaks a bot hand into the events it hands back', async () => {
    const { data } = await call('bruno', '/api/daily/bet', { bet: 1 })
    const leaked = data.events.filter(
      (e) => isPrivateEvent(e) && e.playerId !== data.daily.table.snapshot.leaderId,
    )
    expect(leaked).toEqual([])
  })

  it('keeps the bet final — one hand per day', async () => {
    const again = await call('ana', '/api/daily/bet', { bet: 5 })
    expect(again.status).toBe(400)
    expect(again.data.message).toMatch(/já apostou/i)
  })

  it('refuses to play on once the hand is over', async () => {
    const res = await call('ana', '/api/daily/play', { card: 'A-♠️' })
    expect(res.status).toBe(400)
    expect(res.data.message).toMatch(/já jogou/i)
  })

  it('refuses a card that is not legal right now', async () => {
    const res = await call('bruno', '/api/daily/play', { card: 'A-♠️' })
    expect(res.status).toBe(400)
    expect(res.data.message).toMatch(/não pode ser jogada/i)
  })

  it('refuses to play before betting', async () => {
    const res = await call('carla', '/api/daily/play', { card: 'A-♠️' })
    expect(res.status).toBe(400)
    expect(res.data.message).toMatch(/aposta/i)
  })

  it('resumes a half-played hand from storage, not from a session', async () => {
    const opened = await call('carla', '/api/daily/bet', { bet: 1 })
    const first = opened.data.daily.table.playableCards.find((c) => !c.disabled)!
    const afterOne = await call('carla', '/api/daily/play', { card: first.value })

    // a cold GET — nothing is held in memory between requests
    const reloaded = await call('carla', '/api/daily')
    expect(reloaded.data.daily.table.snapshot).toEqual(afterOne.data.daily.table.snapshot)
    expect(reloaded.data.daily.table.betting).toBe(false)
    expect(reloaded.data.daily.table.complete).toBe(false)
    // the played card is gone from the hand for good
    expect(reloaded.data.daily.table.playableCards.map((c) => c.value)).not.toContain(first.value)
  })

  it('leaves an unfinished hand off the board and out of the streak', async () => {
    const { data } = await call('carla', '/api/daily')
    expect(data.daily.leaderboard.map((r) => r.id)).not.toContain('carla')
    expect(data.daily.streak).toBe(0)
    expect(data.daily.result).toBeNull()
  })

  it('answers a duplicate play with the table instead of a second card', async () => {
    const { data } = await call('carla', '/api/daily')
    const before = data.daily.table.snapshot.currentRound.turns.length
    const card = data.daily.table.playableCards.find((c) => !c.disabled)!.value

    const [a, b] = await Promise.all([
      call('carla', '/api/daily/play', { card }),
      call('carla', '/api/daily/play', { card }),
    ])
    expect([a.status, b.status]).toEqual([200, 200])

    const after = await call('carla', '/api/daily')
    const plays = after.data.daily.table.snapshot.currentRound
    // exactly one more of the player's cards left the hand
    expect(after.data.daily.table.playableCards.map((c) => c.value)).not.toContain(card)
    expect(plays.turns.length).toBeGreaterThanOrEqual(before)
    expect(after.data.daily.table.complete).toBe(false)
  })
})
