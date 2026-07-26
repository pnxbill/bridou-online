import type { PlayerInfo, ScoreboardEntry } from './game'

/**
 * A Resenha — the post-game recap.
 *
 * Every field here is derived from the persisted domain-event log, so a resenha
 * can be rebuilt for any finished game at any time. It exists to be screenshotted
 * into the group chat, which is why the awards are jokes with evidence attached
 * rather than a dry stats table.
 */

/** A superlative handed out at the end of a game. */
export interface RecapAward {
  /** Stable id — also the catalog key in `AWARDS`. */
  id: string
  label: string
  icon: string
  playerId: string
  playerName: string
  /** The evidence, e.g. "bailou 6 rodadas". Rendered under the label. */
  detail: string
}

/** Cumulative totals after a given round — one point on the turning-point graph. */
export interface RecapRoundPoint {
  roundNumber: number
  /** Cumulative total points per player id. */
  totals: Record<string, number>
}

export interface RecapUnlock {
  playerId: string
  achievementId: string
}

export interface GameRecap {
  gameId: string
  playedAt: string
  durationMs: number
  players: PlayerInfo[]
  finalScoreboard: ScoreboardEntry[]
  awards: RecapAward[]
  /** 13 entries, one per round — the lead-change story. */
  progression: RecapRoundPoint[]
  unlocks: RecapUnlock[]
  /** Biggest single-round swing in the game, for the headline stat. */
  biggestComeback: { playerId: string; playerName: string; positions: number } | null
  ranked: boolean
}

/**
 * The superlative catalog. Labels are deliberately mean — that is the point.
 * The award is only handed out when the rule finds a clear winner (ties and
 * zero-signal cases are skipped, so a quiet game gets fewer awards, not fake ones).
 */
export const AWARDS = {
  bailarino: { label: 'O Bailarino', icon: '💃' },
  maoDeFerro: { label: 'Mão de Ferro', icon: '✊' },
  cagao: { label: 'O Cagão', icon: '🥚' },
  kamikaze: { label: 'O Kamikaze', icon: '☄️' },
  zebra: { label: 'A Zebra', icon: '🦓' },
  carrasco: { label: 'O Carrasco', icon: '🔨' },
  pedreiro: { label: 'O Pedreiro', icon: '🧱' },
  sortudo: { label: 'O Sortudo', icon: '🍀' },
} as const

export type AwardId = keyof typeof AWARDS
