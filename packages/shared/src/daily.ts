import type { Card } from './cards'
import type { PlayerInfo } from './game'

/**
 * A Mão do Dia — one hand, the same deal for everybody, once a day.
 *
 * The whole point is to give the app a reason to exist on a night when nobody
 * else is online: 90 seconds, a shared deal so scores are comparable, and a
 * result worth arguing about in the group chat. The deal is derived from the
 * date alone (seeded RNG), so any server reproduces it identically and no state
 * is needed to hand out the puzzle.
 */

/** Players at the daily table: you plus three bots. */
export const DAILY_PLAYERS = 4
export const DAILY_CARDS = 5

/** `YYYY-MM-DD` in São Paulo time — the day boundary players actually live in. */
export type DailyDate = string

export interface DailyHandPuzzle {
  date: DailyDate
  trunfo: Card
  /** Your hand for the day. */
  hand: Card[]
  /** Seat order at the daily table; index 0 is always the human. */
  seats: PlayerInfo[]
  availableBets: number[]
}

export interface DailyAttempt {
  date: DailyDate
  playerId: string
  bet: number
  made: number
  points: number
  /** Whether the bet was exact. */
  exact: boolean
  playedAt: string
}

export interface DailyLeaderboardRow extends PlayerInfo {
  bet: number
  made: number
  points: number
  exact: boolean
  position: number
}

export interface DailyState {
  puzzle: DailyHandPuzzle
  /** Present once the player has played today. */
  attempt: DailyAttempt | null
  leaderboard: DailyLeaderboardRow[]
  /** Consecutive days played, for the streak flame. */
  streak: number
}

/** Deterministic per-day seed — same string in, same deal out, on any server. */
export const dailySeed = (date: DailyDate): string => `bridou-daily-${date}`

/** The date key for an instant, in America/Sao_Paulo. */
export const dailyDateFor = (at: Date = new Date()): DailyDate =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)

/** Scoring mirrors a normal round: exact bet is 10 + tricks, a miss is -1. */
export const dailyPoints = (bet: number, made: number): number => (bet === made ? 10 + made : -1)
