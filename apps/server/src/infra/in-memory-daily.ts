import type { DailyAttemptRow, DailyRepository } from '../application/ports'

/** Walks back one day at a time from `date`, counting unbroken attempts. */
export const countStreak = (dates: ReadonlySet<string>, date: string): number => {
  let streak = 0
  const cursor = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(cursor.getTime())) return 0

  while (streak < 3650) {
    const key = cursor.toISOString().slice(0, 10)
    if (!dates.has(key)) break
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

/** Finished first, then best score, then whoever got there first. */
export const compareAttempts = (a: DailyAttemptRow, b: DailyAttemptRow): number =>
  b.points - a.points ||
  (a.finishedAt?.getTime() ?? a.playedAt.getTime()) -
    (b.finishedAt?.getTime() ?? b.playedAt.getTime())

export class InMemoryDailyRepository implements DailyRepository {
  readonly attempts = new Map<string, DailyAttemptRow>()

  private key(date: string, playerId: string): string {
    return `${date}:${playerId}`
  }

  async start({
    date,
    playerId,
    bet,
  }: {
    date: string
    playerId: string
    bet: number
  }): Promise<boolean> {
    const key = this.key(date, playerId)
    if (this.attempts.has(key)) return false
    this.attempts.set(key, {
      date,
      playerId,
      bet,
      plays: [],
      made: 0,
      points: 0,
      finished: false,
      playedAt: new Date(),
      finishedAt: null,
    })
    return true
  }

  async appendPlay(
    date: string,
    playerId: string,
    card: string,
    afterPlays: number,
  ): Promise<boolean> {
    const row = this.attempts.get(this.key(date, playerId))
    if (!row || row.finished || row.plays.length !== afterPlays) return false
    row.plays = [...row.plays, card]
    return true
  }

  async finish(date: string, playerId: string, made: number, points: number): Promise<void> {
    const row = this.attempts.get(this.key(date, playerId))
    if (!row || row.finished) return
    row.made = made
    row.points = points
    row.finished = true
    row.finishedAt = new Date()
  }

  async attemptFor(date: string, playerId: string): Promise<DailyAttemptRow | null> {
    const row = this.attempts.get(this.key(date, playerId))
    return row ? { ...row, plays: [...row.plays] } : null
  }

  async leaderboard(date: string, playerIds?: string[]): Promise<DailyAttemptRow[]> {
    const allowed = playerIds ? new Set(playerIds) : null
    return [...this.attempts.values()]
      .filter(
        (row) => row.date === date && row.finished && (!allowed || allowed.has(row.playerId)),
      )
      .sort(compareAttempts)
  }

  async streak(playerId: string, date: string): Promise<number> {
    const played = new Set(
      [...this.attempts.values()]
        .filter((r) => r.playerId === playerId && r.finished)
        .map((r) => r.date),
    )
    return countStreak(played, date)
  }
}
