/** One row of the all-time leaderboard, aggregated over ranked games only. */
export interface RankingEntry {
  playerId: string
  name: string
  photoURL: string | null
  gamesPlayed: number
  wins: number
  /** wins / gamesPlayed, 0..1. */
  winRate: number
  totalPoints: number
  bailadas: number
}
