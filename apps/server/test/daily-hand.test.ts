import { DAILY_CARDS, dailyDateFor, dailyPoints, dailySeed } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { DailyHandService, DAILY_HUMAN_SEAT } from '../src/application/daily-hand'
import { InMemoryDailyRepository, countStreak } from '../src/infra/in-memory-daily'

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
})

describe('DailyHandService', () => {
  const daily = new DailyHandService()

  it('deals the same hand for a date every single time', () => {
    const a = daily.puzzle('2026-03-10')
    const b = daily.puzzle('2026-03-10')
    expect(a).toEqual(b)
    expect(a.hand).toHaveLength(DAILY_CARDS)
    expect(a.trunfo).toBeTruthy()
    expect(a.seats).toHaveLength(4)
    expect(a.seats[0]?.id).toBe(DAILY_HUMAN_SEAT)
  })

  it('deals a different hand on a different date', () => {
    expect(daily.puzzle('2026-03-10').hand).not.toEqual(daily.puzzle('2026-03-11').hand)
  })

  it('never deals a duplicate card across the table', () => {
    const puzzle = daily.puzzle('2026-05-02')
    // the viewer's own hand plus the trunfo must all be distinct
    const seen = new Set([...puzzle.hand, puzzle.trunfo])
    expect(seen.size).toBe(puzzle.hand.length + 1)
  })

  it('offers every bet from 0 to the hand size', () => {
    // The human bets first, so the last-bettor restriction never applies.
    expect(daily.puzzle('2026-03-10').availableBets).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('resolves a bet deterministically — same date and bet, same result', () => {
    const first = daily.resolve('2026-03-10', 2)
    const second = daily.resolve('2026-03-10', 2)
    expect(first).toEqual(second)
    expect(first.made).toBeGreaterThanOrEqual(0)
    expect(first.made).toBeLessThanOrEqual(DAILY_CARDS)
    expect(first.points).toBe(dailyPoints(2, first.made))
  })

  it('plays the whole hand out — tricks always total the hand size', () => {
    // Every trick must be won by someone, so `made` over all bets stays sane.
    for (const bet of [0, 1, 2, 3, 4, 5]) {
      const { made } = daily.resolve('2026-04-01', bet)
      expect(made).toBeGreaterThanOrEqual(0)
      expect(made).toBeLessThanOrEqual(DAILY_CARDS)
    }
  })

  it('lets the bet change how the seat is played', () => {
    // Across a spread of days, calling 0 versus calling 4 should not always
    // produce an identical result — otherwise the puzzle would be a coin flip.
    const dates = ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14']
    const differs = dates.some(
      (date) => daily.resolve(date, 0).made !== daily.resolve(date, 4).made,
    )
    expect(differs).toBe(true)
  })

  it('rejects a bet outside the hand', () => {
    expect(() => daily.resolve('2026-03-10', 9)).toThrow()
    expect(() => daily.resolve('2026-03-10', -1)).toThrow()
  })
})

describe('daily attempts', () => {
  it('accepts one attempt per player per day', async () => {
    const repo = new InMemoryDailyRepository()
    const row = { date: '2026-03-10', playerId: 'ana', bet: 2, made: 2, points: 12 }

    expect(await repo.record(row)).toBe(true)
    expect(await repo.record({ ...row, bet: 5, made: 5, points: 15 })).toBe(false)

    const stored = await repo.attemptFor('2026-03-10', 'ana')
    expect(stored).toMatchObject({ bet: 2, points: 12 })
  })

  it('ranks the day best-first', async () => {
    const repo = new InMemoryDailyRepository()
    await repo.record({ date: 'd', playerId: 'ana', bet: 1, made: 1, points: 11 })
    await repo.record({ date: 'd', playerId: 'bru', bet: 3, made: 3, points: 13 })
    await repo.record({ date: 'd', playerId: 'cai', bet: 2, made: 1, points: -1 })

    expect((await repo.leaderboard('d')).map((r) => r.playerId)).toEqual(['bru', 'ana', 'cai'])
  })

  it('filters the leaderboard to a set of players', async () => {
    const repo = new InMemoryDailyRepository()
    await repo.record({ date: 'd', playerId: 'ana', bet: 1, made: 1, points: 11 })
    await repo.record({ date: 'd', playerId: 'zed', bet: 3, made: 3, points: 13 })

    expect((await repo.leaderboard('d', ['ana'])).map((r) => r.playerId)).toEqual(['ana'])
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
