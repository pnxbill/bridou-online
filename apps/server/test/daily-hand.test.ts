import {
  DAILY_CARDS,
  dailyDateFor,
  dailyPoints,
  dailySeed,
  dailyShareText,
  isPrivateEvent,
} from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { DailyHandService, DAILY_HUMAN_SEAT } from '../src/application/daily-hand'
import { InMemoryDailyRepository, countStreak } from '../src/infra/in-memory-daily'

/** Plays the day's hand to the end, always taking the first legal card. */
const playThrough = (daily: DailyHandService, date: string, bet: number) => {
  const plays: string[] = []
  let state = daily.replay(date, bet, plays)
  while (!state.complete) {
    const card = state.legalNow[0]
    if (!card) throw new Error('stuck: no legal card and the hand is not over')
    plays.push(card)
    state = daily.replay(date, bet, plays)
  }
  return { state, plays }
}

describe('daily helpers', () => {
  it('derives a stable seed and a São Paulo date key', () => {
    expect(dailySeed('2026-03-10')).toBe('bridou-daily-2026-03-10')
    // 02:00 UTC on the 11th is still the 10th in São Paulo (UTC-3)
    expect(dailyDateFor(new Date('2026-03-11T02:00:00Z'))).toBe('2026-03-10')
    expect(dailyDateFor(new Date('2026-03-11T04:00:00Z'))).toBe('2026-03-11')
  })

  it('scores a daily hand like a normal round', () => {
    expect(dailyPoints(2, 2)).toBe(12)
    expect(dailyPoints(0, 0)).toBe(10)
    expect(dailyPoints(3, 2)).toBe(-1)
  })

  it('builds a share grid that says how you did without saying what you held', () => {
    const text = dailyShareText(
      '2026-03-10',
      { bet: 2, made: 2, points: 12, trickWins: [true, false, true, false, false] },
      4,
    )
    expect(text).toContain('10/03')
    expect(text).toContain('Pedi 2 · Fiz 2 · +12')
    expect(text).toContain('🟩⬛🟩⬛⬛')
    expect(text).toContain('🔥 4 dias')
    // no card ever leaks into the paste
    expect(text).not.toMatch(/[♠️♥️♣️♦️]/)
  })

  it('leaves the streak line off until it is worth bragging about', () => {
    const one = dailyShareText('2026-03-10', { bet: 0, made: 1, points: -1, trickWins: [] }, 1)
    expect(one).not.toContain('🔥')
    expect(one).toContain('-1')
  })
})

describe('DailyHandService', () => {
  const daily = new DailyHandService()

  it('deals the same hand for a date every single time', () => {
    const a = daily.replay('2026-03-10', null, [])
    const b = daily.replay('2026-03-10', null, [])
    expect(a.playableCards).toEqual(b.playableCards)
    expect(a.playableCards).toHaveLength(DAILY_CARDS)
    expect(a.snapshot.currentRound.trunfo).toBeTruthy()
    expect(a.snapshot.currentRound.players).toHaveLength(4)
    expect(a.snapshot.currentRound.players[0]?.id).toBe(DAILY_HUMAN_SEAT)
  })

  it('deals a different hand on a different date', () => {
    expect(daily.replay('2026-03-10', null, []).playableCards).not.toEqual(
      daily.replay('2026-03-11', null, []).playableCards,
    )
  })

  it('never deals a duplicate card across the table', () => {
    const state = daily.replay('2026-05-02', null, [])
    const hand = state.playableCards.map((c) => c.value)
    const seen = new Set([...hand, state.snapshot.currentRound.trunfo])
    expect(seen.size).toBe(hand.length + 1)
  })

  it('offers every bet from 0 to the hand size', () => {
    // The human bets first, so the last-bettor restriction never applies.
    expect(daily.replay('2026-03-10', null, []).availableBets).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('waits for the bet before dealing anyone into a trick', () => {
    const state = daily.replay('2026-03-10', null, [])
    expect(state.betting).toBe(true)
    expect(state.complete).toBe(false)
    expect(state.legalNow).toEqual([])
    // nobody has bet yet — not even the bots, who sit after the human
    expect(state.snapshot.currentRound.players.every((p) => p.bet === null)).toBe(true)
  })

  it('runs the bots up to the player once the bet is in', () => {
    const state = daily.replay('2026-03-10', 2, [])
    expect(state.betting).toBe(false)
    expect(state.snapshot.currentRound.players.every((p) => p.bet !== null)).toBe(true)
    // the human leads the first trick, so the table is empty and waiting
    expect(state.snapshot.currentRound.currentTurn?.playedCards).toEqual([])
    expect(state.legalNow).toHaveLength(DAILY_CARDS)
  })

  it('replays identically for the same decisions', () => {
    const a = playThrough(daily, '2026-03-10', 2)
    const b = daily.replay('2026-03-10', 2, a.plays)
    expect(b.made).toBe(a.state.made)
    expect(b.trickWins).toEqual(a.state.trickWins)
    expect(b.snapshot).toEqual(a.state.snapshot)
  })

  it('plays out to exactly one winner per trick', () => {
    for (const bet of [0, 1, 2, 3, 4, 5]) {
      const { state } = playThrough(daily, '2026-04-01', bet)
      expect(state.complete).toBe(true)
      expect(state.trickWins).toHaveLength(DAILY_CARDS)
      expect(state.made).toBe(state.trickWins.filter(Boolean).length)
      expect(state.snapshot.currentRound.whoMade).toHaveLength(DAILY_CARDS)
    }
  })

  it('lets how you play change the result, not just what you call', () => {
    // Taking the highest card every trick must not always match taking the
    // lowest — otherwise the hand would play itself and the bet is the game.
    const date = '2026-04-01'
    const lines = (pick: (cards: string[]) => string) => {
      const plays: string[] = []
      let state = daily.replay(date, 2, plays)
      while (!state.complete) {
        plays.push(pick(state.legalNow))
        state = daily.replay(date, 2, plays)
      }
      return state.made
    }
    const first = lines((cards) => cards[0]!)
    const last = lines((cards) => cards.at(-1)!)
    expect(first).not.toBe(last)
  })

  it('rejects a bet outside the hand', () => {
    expect(() => daily.replay('2026-03-10', 9, [])).toThrow()
    expect(() => daily.replay('2026-03-10', -1, [])).toThrow()
  })

  it('rejects a card that is not in the hand', () => {
    expect(() => daily.replay('2026-03-10', 2, ['A-♠️', 'A-♠️'])).toThrow()
  })

  it('only reports events the player is allowed to see', () => {
    const { state } = playThrough(daily, '2026-03-10', 2)
    const leaked = state.events.filter(
      (e) => isPrivateEvent(e) && e.playerId !== DAILY_HUMAN_SEAT,
    )
    expect(leaked).toEqual([])
    // and the log really is the whole hand, not a summary
    expect(state.events.filter((e) => e.type === 'card-played')).toHaveLength(
      DAILY_CARDS * 4,
    )
    expect(state.events.at(-1)?.type).toBe('round-ended')
  })

  it('marks where the last action starts so the client animates only that', () => {
    const opening = daily.replay('2026-03-10', null, [])
    // nothing has happened yet: there is nothing new to animate
    expect(opening.sinceLastAction).toBe(opening.events.length)

    const afterBet = daily.replay('2026-03-10', 2, [])
    const fresh = afterBet.events.slice(afterBet.sinceLastAction)
    expect(fresh[0]).toMatchObject({ type: 'player-bet', playerId: DAILY_HUMAN_SEAT })
    // the player's bet, the three bots', then the first trick opens
    expect(fresh.filter((e) => e.type === 'player-bet')).toHaveLength(4)
    expect(fresh.some((e) => e.type === 'turn-started')).toBe(true)
  })

  it('replays a mid-hand attempt without re-emitting what was already watched', () => {
    const { plays } = playThrough(daily, '2026-03-10', 2)
    const state = daily.replay('2026-03-10', 2, plays.slice(0, 1))
    const fresh = state.events.slice(state.sinceLastAction)
    // the player's card first, then everything the table did in reply — the
    // rest of the trick, and however far into the next one the bots got
    expect(fresh[0]).toMatchObject({ type: 'card-played', playerId: DAILY_HUMAN_SEAT })
    expect(
      fresh.filter((e) => e.type === 'card-played' && e.playerId === DAILY_HUMAN_SEAT),
    ).toHaveLength(1)
    expect(fresh.some((e) => e.type === 'turn-ended')).toBe(true)
    // and it stops the moment the player is on the spot again
    expect(fresh.at(-1)).toMatchObject({ type: 'play-requested', playerId: DAILY_HUMAN_SEAT })
  })
})

describe('par', () => {
  const daily = new DailyHandService()

  it('is the best score any line of play could have reached', async () => {
    const date = '2026-04-01'
    const par = await daily.par(date)

    // No actual line may beat it, and at least one must reach it.
    let bestSeen = -Infinity
    for (const bet of [0, 1, 2, 3, 4, 5]) {
      const { state } = playThrough(daily, date, bet)
      bestSeen = Math.max(bestSeen, dailyPoints(bet, state.made))
    }
    expect(bestSeen).toBeLessThanOrEqual(par)
    // calling zero and taking nothing is always worth 10, so par can't be worse
    expect(par).toBeGreaterThanOrEqual(-1)
    expect(par).toBeLessThanOrEqual(dailyPoints(DAILY_CARDS, DAILY_CARDS))
  })

  it('answers the same for a date every time (and caches it)', async () => {
    expect(await daily.par('2026-04-02')).toBe(await daily.par('2026-04-02'))
  })
})

describe('daily attempts', () => {
  const open = async (repo: InMemoryDailyRepository, playerId: string, bet: number) =>
    repo.start({ date: 'd', playerId, bet })

  it('accepts one attempt per player per day', async () => {
    const repo = new InMemoryDailyRepository()
    expect(await repo.start({ date: '2026-03-10', playerId: 'ana', bet: 2 })).toBe(true)
    expect(await repo.start({ date: '2026-03-10', playerId: 'ana', bet: 5 })).toBe(false)

    const stored = await repo.attemptFor('2026-03-10', 'ana')
    expect(stored).toMatchObject({ bet: 2, plays: [], finished: false, points: 0 })
  })

  it('appends plays in order, one at a time', async () => {
    const repo = new InMemoryDailyRepository()
    await open(repo, 'ana', 2)

    expect(await repo.appendPlay('d', 'ana', 'A-♠️', 0)).toBe(true)
    expect(await repo.appendPlay('d', 'ana', '7-♥️', 1)).toBe(true)
    expect((await repo.attemptFor('d', 'ana'))?.plays).toEqual(['A-♠️', '7-♥️'])
  })

  it('refuses a play that raced another one', async () => {
    const repo = new InMemoryDailyRepository()
    await open(repo, 'ana', 2)
    await repo.appendPlay('d', 'ana', 'A-♠️', 0)

    // a double tap arrives believing the hand is still empty
    expect(await repo.appendPlay('d', 'ana', '7-♥️', 0)).toBe(false)
    expect((await repo.attemptFor('d', 'ana'))?.plays).toEqual(['A-♠️'])
  })

  it('refuses a play once the hand is over', async () => {
    const repo = new InMemoryDailyRepository()
    await open(repo, 'ana', 2)
    await repo.finish('d', 'ana', 2, 12)

    expect(await repo.appendPlay('d', 'ana', 'A-♠️', 0)).toBe(false)
  })

  it('scores on finish and will not rescore', async () => {
    const repo = new InMemoryDailyRepository()
    await open(repo, 'ana', 2)
    await repo.finish('d', 'ana', 2, 12)
    await repo.finish('d', 'ana', 5, 15)

    expect(await repo.attemptFor('d', 'ana')).toMatchObject({
      made: 2,
      points: 12,
      finished: true,
    })
  })

  it('ranks the day best-first, finished hands only', async () => {
    const repo = new InMemoryDailyRepository()
    await open(repo, 'ana', 1)
    await open(repo, 'bru', 3)
    await open(repo, 'cai', 2)
    await open(repo, 'dan', 1)
    await repo.finish('d', 'ana', 1, 11)
    await repo.finish('d', 'bru', 3, 13)
    await repo.finish('d', 'cai', 1, -1)
    // dan is still mid-hand — an abandoned attempt is not a score

    expect((await repo.leaderboard('d')).map((r) => r.playerId)).toEqual(['bru', 'ana', 'cai'])
  })

  it('filters the leaderboard to a set of players', async () => {
    const repo = new InMemoryDailyRepository()
    await open(repo, 'ana', 1)
    await open(repo, 'zed', 3)
    await repo.finish('d', 'ana', 1, 11)
    await repo.finish('d', 'zed', 3, 13)

    expect((await repo.leaderboard('d', ['ana'])).map((r) => r.playerId)).toEqual(['ana'])
  })

  it('only counts a finished hand toward the streak', async () => {
    const repo = new InMemoryDailyRepository()
    await repo.start({ date: '2026-03-10', playerId: 'ana', bet: 1 })
    expect(await repo.streak('ana', '2026-03-10')).toBe(0)

    await repo.finish('2026-03-10', 'ana', 1, 11)
    expect(await repo.streak('ana', '2026-03-10')).toBe(1)
  })
})

describe('countStreak', () => {
  it('counts back over consecutive days and stops at the first gap', () => {
    const played = new Set(['2026-03-10', '2026-03-09', '2026-03-08', '2026-03-06'])
    expect(countStreak(played, '2026-03-10')).toBe(3)
  })

  it('is zero when today has not been played', () => {
    expect(countStreak(new Set(['2026-03-09']), '2026-03-10')).toBe(0)
  })

  it('walks across a month boundary', () => {
    const played = new Set(['2026-03-01', '2026-02-28', '2026-02-27'])
    expect(countStreak(played, '2026-03-01')).toBe(3)
  })
})
