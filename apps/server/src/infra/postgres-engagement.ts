import type { HeadToHead, UnlockedAchievement } from '@bridou/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import type {
  AchievementRepository,
  PlayerCareerStats,
  PlayerGameOutcome,
  PlayerStatsRepository,
} from '../application/ports'
import type { Db } from '../db/client'
import { playerAchievements, playerRivalries, playerStats, players } from '../db/schema'

export class PostgresAchievementRepository implements AchievementRepository {
  constructor(private readonly db: Db['db']) {}

  /**
   * `onConflictDoNothing` + `returning` is what makes this fire-once: the
   * returned rows are empty when the conquista was already held, so the caller
   * knows not to publish a duplicate unlock.
   */
  async unlock(playerId: string, achievementId: string, gameId: string | null): Promise<boolean> {
    const inserted = await this.db
      .insert(playerAchievements)
      .values({ playerId, achievementId, gameId, unlockedAt: new Date() })
      .onConflictDoNothing()
      .returning({ achievementId: playerAchievements.achievementId })
    return inserted.length > 0
  }

  async listFor(playerId: string): Promise<UnlockedAchievement[]> {
    const rows = await this.db
      .select({
        achievementId: playerAchievements.achievementId,
        unlockedAt: playerAchievements.unlockedAt,
        gameId: playerAchievements.gameId,
      })
      .from(playerAchievements)
      .where(eq(playerAchievements.playerId, playerId))
      .orderBy(desc(playerAchievements.unlockedAt))

    return rows.map((row) => ({
      achievementId: row.achievementId,
      unlockedAt: row.unlockedAt.toISOString(),
      gameId: row.gameId,
    }))
  }

  async countFor(playerId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(playerAchievements)
      .where(eq(playerAchievements.playerId, playerId))
    return row?.count ?? 0
  }

  async listForGame(gameId: string): Promise<Array<{ playerId: string; achievementId: string }>> {
    return this.db
      .select({
        playerId: playerAchievements.playerId,
        achievementId: playerAchievements.achievementId,
      })
      .from(playerAchievements)
      .where(eq(playerAchievements.gameId, gameId))
  }
}

const emptyStats = (playerId: string): PlayerCareerStats => ({
  playerId,
  gamesPlayed: 0,
  wins: 0,
  hosted: 0,
  currentWinStreak: 0,
  bestWinStreak: 0,
  totalPoints: 0,
  bailadas: 0,
})

export class PostgresPlayerStatsRepository implements PlayerStatsRepository {
  constructor(private readonly db: Db['db']) {}

  async get(playerId: string): Promise<PlayerCareerStats> {
    const [row] = await this.db
      .select()
      .from(playerStats)
      .where(eq(playerStats.playerId, playerId))
    if (!row) return emptyStats(playerId)
    return {
      playerId: row.playerId,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      hosted: row.hosted,
      currentWinStreak: row.currentWinStreak,
      bestWinStreak: row.bestWinStreak,
      totalPoints: row.totalPoints,
      bailadas: row.bailadas,
    }
  }

  /**
   * One upsert does the whole thing: a win extends the streak, anything else
   * resets it, and `best_win_streak` takes the greater of old and new. Doing it
   * in SQL keeps concurrent games from clobbering each other's counters.
   */
  async applyGameResult(outcome: PlayerGameOutcome): Promise<PlayerCareerStats> {
    const won = outcome.rank === 1
    const [row] = await this.db
      .insert(playerStats)
      .values({
        playerId: outcome.playerId,
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        currentWinStreak: won ? 1 : 0,
        bestWinStreak: won ? 1 : 0,
        totalPoints: outcome.points,
        bailadas: outcome.bailadas,
        lastPlayedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: playerStats.playerId,
        set: {
          gamesPlayed: sql`${playerStats.gamesPlayed} + 1`,
          wins: sql`${playerStats.wins} + ${won ? 1 : 0}`,
          currentWinStreak: won ? sql`${playerStats.currentWinStreak} + 1` : sql`0`,
          bestWinStreak: won
            ? sql`greatest(${playerStats.bestWinStreak}, ${playerStats.currentWinStreak} + 1)`
            : playerStats.bestWinStreak,
          totalPoints: sql`${playerStats.totalPoints} + ${outcome.points}`,
          bailadas: sql`${playerStats.bailadas} + ${outcome.bailadas}`,
          lastPlayedAt: new Date(),
        },
      })
      .returning()

    await this.recordRivalries(outcome)

    if (!row) return emptyStats(outcome.playerId)
    return {
      playerId: row.playerId,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      hosted: row.hosted,
      currentWinStreak: row.currentWinStreak,
      bestWinStreak: row.bestWinStreak,
      totalPoints: row.totalPoints,
      bailadas: row.bailadas,
    }
  }

  private async recordRivalries(outcome: PlayerGameOutcome): Promise<void> {
    const now = new Date()
    for (const opponentId of outcome.beat) {
      await this.db
        .insert(playerRivalries)
        .values({
          playerId: outcome.playerId,
          opponentId,
          wins: 1,
          losses: 0,
          streak: 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [playerRivalries.playerId, playerRivalries.opponentId],
          set: {
            wins: sql`${playerRivalries.wins} + 1`,
            streak: sql`${playerRivalries.streak} + 1`,
            updatedAt: now,
          },
        })
    }
    for (const opponentId of outcome.lostTo) {
      await this.db
        .insert(playerRivalries)
        .values({
          playerId: outcome.playerId,
          opponentId,
          wins: 0,
          losses: 1,
          streak: 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [playerRivalries.playerId, playerRivalries.opponentId],
          set: {
            losses: sql`${playerRivalries.losses} + 1`,
            streak: sql`0`,
            updatedAt: now,
          },
        })
    }
  }

  async bumpHosted(playerId: string): Promise<void> {
    await this.db
      .insert(playerStats)
      .values({ playerId, hosted: 1 })
      .onConflictDoUpdate({
        target: playerStats.playerId,
        set: { hosted: sql`${playerStats.hosted} + 1` },
      })
  }

  async bestRivalryStreak(playerId: string): Promise<number> {
    const [row] = await this.db
      .select({ best: sql<number>`coalesce(max(${playerRivalries.streak}), 0)::int` })
      .from(playerRivalries)
      .where(eq(playerRivalries.playerId, playerId))
    return row?.best ?? 0
  }

  async headToHead(playerId: string): Promise<HeadToHead[]> {
    const rows = await this.db
      .select({
        opponentId: playerRivalries.opponentId,
        opponentName: players.displayName,
        opponentPhotoURL: players.photoUrl,
        wins: playerRivalries.wins,
        losses: playerRivalries.losses,
      })
      .from(playerRivalries)
      .leftJoin(players, eq(playerRivalries.opponentId, players.id))
      .where(and(eq(playerRivalries.playerId, playerId)))
      .orderBy(desc(sql`${playerRivalries.wins} + ${playerRivalries.losses}`))

    return rows.map((row) => ({
      opponentId: row.opponentId,
      opponentName: row.opponentName ?? row.opponentId,
      ...(row.opponentPhotoURL ? { opponentPhotoURL: row.opponentPhotoURL } : {}),
      wins: row.wins,
      losses: row.losses,
    }))
  }
}
