import { and, desc, eq, inArray, lte } from 'drizzle-orm'
import type { DailyAttemptRow, DailyRepository } from '../application/ports'
import type { Db } from '../db/client'
import { dailyAttempts } from '../db/schema'
import { countStreak } from './in-memory-daily'

export class PostgresDailyRepository implements DailyRepository {
  constructor(private readonly db: Db['db']) {}

  /**
   * `onConflictDoNothing` + `returning` makes the one-attempt-per-day rule
   * atomic: a double submit gets `false`, not a silently overwritten score.
   */
  async record(row: Omit<DailyAttemptRow, 'playedAt'>): Promise<boolean> {
    const inserted = await this.db
      .insert(dailyAttempts)
      .values({ ...row, playedAt: new Date() })
      .onConflictDoNothing()
      .returning({ date: dailyAttempts.date })
    return inserted.length > 0
  }

  async attemptFor(date: string, playerId: string): Promise<DailyAttemptRow | null> {
    const [row] = await this.db
      .select()
      .from(dailyAttempts)
      .where(and(eq(dailyAttempts.date, date), eq(dailyAttempts.playerId, playerId)))
    return row ?? null
  }

  async leaderboard(date: string, playerIds?: string[]): Promise<DailyAttemptRow[]> {
    if (playerIds && !playerIds.length) return []
    const where = playerIds
      ? and(eq(dailyAttempts.date, date), inArray(dailyAttempts.playerId, playerIds))
      : eq(dailyAttempts.date, date)

    return this.db
      .select()
      .from(dailyAttempts)
      .where(where)
      .orderBy(desc(dailyAttempts.points), dailyAttempts.playedAt)
  }

  async streak(playerId: string, date: string): Promise<number> {
    // A year of history is far more than any streak worth showing.
    const rows = await this.db
      .select({ date: dailyAttempts.date })
      .from(dailyAttempts)
      .where(and(eq(dailyAttempts.playerId, playerId), lte(dailyAttempts.date, date)))
      .orderBy(desc(dailyAttempts.date))
      .limit(400)

    return countStreak(new Set(rows.map((r) => r.date)), date)
  }
}
