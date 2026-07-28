import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import type { DailyAttemptRow, DailyRepository } from '../application/ports'
import type { Db } from '../db/client'
import { dailyAttempts } from '../db/schema'
import { countStreak } from './in-memory-daily'

export class PostgresDailyRepository implements DailyRepository {
  constructor(private readonly db: Db['db']) {}

  /**
   * `onConflictDoNothing` + `returning` makes the one-attempt-per-day rule
   * atomic: a double submit gets `false`, not a silently overwritten bet.
   */
  async start(input: { date: string; playerId: string; bet: number }): Promise<boolean> {
    const inserted = await this.db
      .insert(dailyAttempts)
      .values({ ...input, plays: [], made: 0, points: 0, finished: false, playedAt: new Date() })
      .onConflictDoNothing()
      .returning({ date: dailyAttempts.date })
    return inserted.length > 0
  }

  /**
   * The `cardinality` guard is the concurrency control: the append only lands
   * on the exact hand the caller validated against, so a double tap or a
   * retried request can't slip a sixth card in.
   */
  async appendPlay(
    date: string,
    playerId: string,
    card: string,
    afterPlays: number,
  ): Promise<boolean> {
    const updated = await this.db
      .update(dailyAttempts)
      .set({ plays: sql`array_append(${dailyAttempts.plays}, ${card})` })
      .where(
        and(
          eq(dailyAttempts.date, date),
          eq(dailyAttempts.playerId, playerId),
          eq(dailyAttempts.finished, false),
          sql`cardinality(${dailyAttempts.plays}) = ${afterPlays}`,
        ),
      )
      .returning({ date: dailyAttempts.date })
    return updated.length > 0
  }

  async finish(date: string, playerId: string, made: number, points: number): Promise<void> {
    await this.db
      .update(dailyAttempts)
      .set({ made, points, finished: true, finishedAt: new Date() })
      .where(
        and(
          eq(dailyAttempts.date, date),
          eq(dailyAttempts.playerId, playerId),
          eq(dailyAttempts.finished, false),
        ),
      )
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
    const scoped = playerIds ? inArray(dailyAttempts.playerId, playerIds) : undefined

    return this.db
      .select()
      .from(dailyAttempts)
      .where(and(eq(dailyAttempts.date, date), eq(dailyAttempts.finished, true), scoped))
      .orderBy(
        desc(dailyAttempts.points),
        // Ties go to whoever got there first. Rows written before the hand was
        // playable have no finish time — fall back to when they were recorded.
        sql`coalesce(${dailyAttempts.finishedAt}, ${dailyAttempts.playedAt})`,
      )
  }

  async streak(playerId: string, date: string): Promise<number> {
    // A year of history is far more than any streak worth showing.
    const rows = await this.db
      .select({ date: dailyAttempts.date })
      .from(dailyAttempts)
      .where(
        and(
          eq(dailyAttempts.playerId, playerId),
          eq(dailyAttempts.finished, true),
          lte(dailyAttempts.date, date),
        ),
      )
      .orderBy(desc(dailyAttempts.date))
      .limit(400)

    return countStreak(new Set(rows.map((r) => r.date)), date)
  }
}
