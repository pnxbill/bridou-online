import type { HeadToHead, UnlockedAchievement } from '@bridou/shared'
import type {
  AchievementRepository,
  PlayerCareerStats,
  PlayerGameOutcome,
  PlayerStatsRepository,
} from '../application/ports'

/**
 * In-memory conquistas / career stats — used by tests and whenever
 * DATABASE_URL is unset, exactly like the history repositories.
 */

interface StoredUnlock extends UnlockedAchievement {
  playerId: string
}

export class InMemoryAchievementRepository implements AchievementRepository {
  readonly unlocks: StoredUnlock[] = []

  async unlock(playerId: string, achievementId: string, gameId: string | null): Promise<boolean> {
    if (this.unlocks.some((u) => u.playerId === playerId && u.achievementId === achievementId)) {
      return false
    }
    this.unlocks.push({
      playerId,
      achievementId,
      gameId,
      unlockedAt: new Date().toISOString(),
    })
    return true
  }

  async listFor(playerId: string): Promise<UnlockedAchievement[]> {
    return this.unlocks
      .filter((u) => u.playerId === playerId)
      .map(({ achievementId, unlockedAt, gameId }) => ({ achievementId, unlockedAt, gameId }))
  }

  async countFor(playerId: string): Promise<number> {
    return this.unlocks.filter((u) => u.playerId === playerId).length
  }

  async listForGame(gameId: string): Promise<Array<{ playerId: string; achievementId: string }>> {
    return this.unlocks
      .filter((u) => u.gameId === gameId)
      .map(({ playerId, achievementId }) => ({ playerId, achievementId }))
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

export class InMemoryPlayerStatsRepository implements PlayerStatsRepository {
  readonly stats = new Map<string, PlayerCareerStats>()
  /** `${playerId}:${opponentId}` → directed record. */
  readonly rivalries = new Map<string, { wins: number; losses: number; streak: number }>()
  readonly names = new Map<string, string>()

  async get(playerId: string): Promise<PlayerCareerStats> {
    return { ...(this.stats.get(playerId) ?? emptyStats(playerId)) }
  }

  async applyGameResult(outcome: PlayerGameOutcome): Promise<PlayerCareerStats> {
    const current = this.stats.get(outcome.playerId) ?? emptyStats(outcome.playerId)
    const won = outcome.rank === 1
    const currentWinStreak = won ? current.currentWinStreak + 1 : 0

    const next: PlayerCareerStats = {
      ...current,
      gamesPlayed: current.gamesPlayed + 1,
      wins: current.wins + (won ? 1 : 0),
      currentWinStreak,
      bestWinStreak: Math.max(current.bestWinStreak, currentWinStreak),
      totalPoints: current.totalPoints + outcome.points,
      bailadas: current.bailadas + outcome.bailadas,
    }
    this.stats.set(outcome.playerId, next)

    for (const opponentId of outcome.beat) {
      const key = `${outcome.playerId}:${opponentId}`
      const record = this.rivalries.get(key) ?? { wins: 0, losses: 0, streak: 0 }
      this.rivalries.set(key, {
        wins: record.wins + 1,
        losses: record.losses,
        streak: record.streak + 1,
      })
    }
    for (const opponentId of outcome.lostTo) {
      const key = `${outcome.playerId}:${opponentId}`
      const record = this.rivalries.get(key) ?? { wins: 0, losses: 0, streak: 0 }
      this.rivalries.set(key, { wins: record.wins, losses: record.losses + 1, streak: 0 })
    }

    return { ...next }
  }

  async bumpHosted(playerId: string): Promise<void> {
    const current = this.stats.get(playerId) ?? emptyStats(playerId)
    this.stats.set(playerId, { ...current, hosted: current.hosted + 1 })
  }

  async bestRivalryStreak(playerId: string): Promise<number> {
    let best = 0
    for (const [key, record] of this.rivalries) {
      if (key.startsWith(`${playerId}:`)) best = Math.max(best, record.streak)
    }
    return best
  }

  async headToHead(playerId: string): Promise<HeadToHead[]> {
    const rows: HeadToHead[] = []
    for (const [key, record] of this.rivalries) {
      const [owner, opponentId] = key.split(':')
      if (owner !== playerId || !opponentId) continue
      rows.push({
        opponentId,
        opponentName: this.names.get(opponentId) ?? opponentId,
        wins: record.wins,
        losses: record.losses,
      })
    }
    return rows.sort((a, b) => b.wins + b.losses - (a.wins + a.losses))
  }
}
