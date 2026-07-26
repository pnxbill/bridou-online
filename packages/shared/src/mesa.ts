import type { PlayerInfo } from './game'

/**
 * A Mesa is a *persistent* group of friends — the thing a lobby code used to be
 * for two hours and now is forever. It owns a rolling season, its own standings,
 * and the head-to-head records that give a Tuesday game some stakes.
 *
 * The mesa code doubles as the invite code; opening a game from a mesa creates a
 * normal lobby whose id is remembered against the mesa, so results flow back
 * into the standings when the game ends.
 */

export interface MesaSummary {
  id: string
  /** Permanent 5-char invite code — never expires, unlike the old lobby codes. */
  code: string
  name: string
  createdBy: string
  createdAt: string
  memberCount: number
  /** Members connected right now — powers "quem tá on". */
  onlineCount: number
}

export interface MesaMember extends PlayerInfo {
  joinedAt: string
  online: boolean
  /** Games played with this mesa, all seasons. */
  gamesPlayed: number
}

export type SeasonStatus = 'active' | 'finished'

export interface SeasonSummary {
  id: string
  mesaId: string
  /** Human label, e.g. "Temporada 3". */
  name: string
  number: number
  startsAt: string
  endsAt: string
  status: SeasonStatus
  /** Set when the season closes. */
  championId: string | null
}

export interface StandingRow extends PlayerInfo {
  position: number
  gamesPlayed: number
  wins: number
  /** Season points — see `seasonPointsFor`. */
  points: number
  totalGamePoints: number
  bailadas: number
}

export interface HeadToHead {
  opponentId: string
  opponentName: string
  opponentPhotoURL?: string
  /** Games where this player finished ahead of the opponent. */
  wins: number
  losses: number
}

/** A finished game as it appears on the mesa's mural. */
export interface MesaGameSummary {
  gameId: string
  playedAt: string
  playerCount: number
  championId: string
  championName: string
  championPoints: number
}

export interface MesaDetail {
  mesa: MesaSummary
  members: MesaMember[]
  season: SeasonSummary | null
  standings: StandingRow[]
  recentGames: MesaGameSummary[]
  /** Past seasons, most recent first — the trophy cabinet. */
  pastSeasons: SeasonSummary[]
}

/**
 * Season points for one finished game.
 *
 * Placement is worth more at a bigger table (beating six people should count for
 * more than beating one), and winning carries a flat bonus on top so a run of
 * second places never quietly out-scores actually winning.
 */
export const seasonPointsFor = (rank: number, playerCount: number): number => {
  const placement = Math.max(0, playerCount - rank + 1)
  return placement + (rank === 1 ? 2 : 0)
}

/** Default season length. Long enough to matter, short enough to feel finite. */
export const SEASON_WEEKS = 6

export const MESA_NAME_MAX = 40
