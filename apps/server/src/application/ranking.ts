import type { RankingEntry } from '@bridou/shared'

/** Per-player totals over ranked games, before rate/ordering are applied. */
export interface RankingAggregate {
  playerId: string
  name: string
  photoURL: string | null
  gamesPlayed: number
  wins: number
  totalPoints: number
  bailadas: number
}

/** Adds winRate and orders best-first: wins, win rate, points, then name. */
export const toRanking = (rows: RankingAggregate[]): RankingEntry[] =>
  rows
    .map((r) => ({ ...r, winRate: r.gamesPlayed ? r.wins / r.gamesPlayed : 0 }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.winRate - a.winRate ||
        b.totalPoints - a.totalPoints ||
        a.name.localeCompare(b.name),
    )
