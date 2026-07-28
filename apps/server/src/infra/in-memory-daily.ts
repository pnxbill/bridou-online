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

export class InMemoryDailyRepository implements DailyRepository {
  readonly attempts = new Map<string, DailyAttemptRow>()

  private key(date: string, playerId: string): string {
    return `${date}:${playerId}`
  }

  async record(row: Omit<DailyAttemptRow, 'playedAt'>): Promise<boolean> {
    const key = this.key(row.date, row.playerId)
    if (this.attempts.has(key)) return false
    this.attempts.set(key, { ...row, playedAt: new Date() })
    return true
  }

  async attemptFor(date: string, playerId: string): Promise<DailyAttemptRow | null> {
    return this.attempts.get(this.key(date, playerId)) ?? null
  }

  async leaderboard(date: string, playerIds?: string[]): Promise<DailyAttemptRow[]> {
    const allowed = playerIds ? new Set(playerIds) : null
    return [...this.attempts.values()]
      .filter((row) => row.date === date && (!allowed || allowed.has(row.playerId)))
      .sort((a, b) => b.points - a.points || a.playedAt.getTime() - b.playedAt.getTime())
  }

  async streak(playerId: string, date: string): Promise<number> {
    const played = new Set(
      [...this.attempts.values()].filter((r) => r.playerId === playerId).map((r) => r.date),
    )
    return countStreak(played, date)
  }
}
