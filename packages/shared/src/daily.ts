import type { Card, HandCard } from './cards'
import type { GameSnapshot, PlayerInfo } from './game'

/**
 * A Mão do Dia — one hand, the same deal for everybody, once a day.
 *
 * The whole point is to give the app a reason to exist on a night when nobody
 * else is online: a few minutes, a shared deal so scores are comparable, and a
 * result worth arguing about in the group chat.
 *
 * You *play* the hand — call your bet, then lead and follow through all five
 * tricks against three bots. The deal and the bots are derived from the date
 * alone (seeded RNG, zero randomness in the bot), so the day's table is
 * identical for everyone and reproducible on any server, forever. That is what
 * makes the scores comparable: same cards, same opponents, only your play
 * differs.
 */

/** Players at the daily table: you plus three bots. */
export const DAILY_PLAYERS = 4
export const DAILY_CARDS = 5

/** `YYYY-MM-DD` in São Paulo time — the day boundary players actually live in. */
export type DailyDate = string

/**
 * The day's table as the player currently sees it, in exactly the shape the
 * game screen already consumes — so the daily is played on the real felt with
 * the real fan, not a bespoke widget.
 */
export interface DailyTable {
  snapshot: GameSnapshot
  playableCards: HandCard[]
  availableBets: number[]
  /** Still waiting on your bet. */
  betting: boolean
  /** All five tricks played. */
  complete: boolean
}

export interface DailyResult {
  bet: number
  made: number
  points: number
  /** Whether the bet was exact. */
  exact: boolean
  /** One entry per trick, `true` where you took it — this is the share grid. */
  trickWins: boolean[]
  /**
   * The most points reachable on today's deal against these bots, over every
   * bet and every legal line of play. `null` when it wasn't computed.
   */
  par: number | null
  finishedAt: string
}

export interface DailyLeaderboardRow extends PlayerInfo {
  bet: number
  made: number
  points: number
  exact: boolean
  position: number
}

export interface DailyState {
  date: DailyDate
  table: DailyTable
  /** Present once the hand has been played to the end. */
  result: DailyResult | null
  leaderboard: DailyLeaderboardRow[]
  /** Consecutive days finished, for the streak flame. */
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

/** `2026-07-28` → `28/07`, the way the date is spoken. */
export const dailyDateLabel = (date: DailyDate): string => {
  const [, month, day] = date.split('-')
  return month && day ? `${day}/${month}` : date
}

/**
 * The thing that actually gets pasted into the group chat.
 *
 * Deliberately a grid and not a sentence: it says how you did without saying
 * what you held, so it can't spoil the hand for whoever reads it first.
 */
export const dailyShareText = (
  date: DailyDate,
  result: Pick<DailyResult, 'bet' | 'made' | 'points' | 'trickWins'>,
  streak = 0,
): string => {
  const grid = result.trickWins.map((won) => (won ? '🟩' : '⬛')).join('')
  const score = result.points > 0 ? `+${result.points}` : `${result.points}`
  const lines = [
    `🃏 Bridou — Mão do Dia ${dailyDateLabel(date)}`,
    `Pedi ${result.bet} · Fiz ${result.made} · ${score}`,
    grid,
  ]
  if (streak > 1) lines.push(`🔥 ${streak} dias`)
  return lines.join('\n')
}

/** Cards the day's hand has been played with so far — what the server stores. */
export type DailyPlays = Card[]
