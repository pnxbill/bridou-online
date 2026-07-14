import type { Card, PlayerInfo } from '@bridou/shared'

/**
 * Plain-JSON serialization of a live game — enough to reconstruct the engine
 * after a server restart. Deals with two kinds of round:
 *
 * - the CURRENT round is stored in full (hands, tricks) so play resumes exactly;
 * - COMPLETED rounds only contribute their per-player points to the scoreboard,
 *   so they're stored slim (no cards, no trick history) and written once.
 *
 * Derived values (`cardsForEachPlayer`, `isBlind`) are never stored — they
 * recompute from the round number. Injected deps (publisher/scheduler/rng)
 * are re-supplied on rehydration, not persisted.
 */

/** A player's full in-round state, including their hand. Already plain JSON. */
export interface RoundPlayerData {
  id: string
  name: string
  photoURL?: string
  isBot?: boolean
  cards: Card[]
  bet: number | null
  made: number | null
  points: number | null
}

/** One trick. Players are referenced by id in play order; the round owns the objects. */
export interface TurnState {
  playerIds: string[]
  suit: string
  playedCards: Card[]
}

/** The in-progress round, stored in full so play resumes card-for-card. */
export interface CurrentRoundState {
  roundNumber: number
  players: RoundPlayerData[]
  trunfo: Card
  betting: boolean
  currentPlayerIndex: number
  turns: TurnState[]
  currentTurn: TurnState | null
  whoMadeIds: string[]
  bailadoresIds: string[]
}

/** A finished round's contribution to the scoreboard — the only thing re-read. */
export interface CompletedRoundResult {
  roundNumber: number
  results: { id: string; bet: number | null; made: number | null; points: number | null }[]
}

/** Everything needed to rebuild a `Game`. */
export interface GameState {
  id: string
  leaderId: string
  currentRoundNumber: number
  scoreboardShowing: boolean
  playerOrder: PlayerInfo[]
  completedRounds: CompletedRoundResult[]
  currentRound: CurrentRoundState | null
}
