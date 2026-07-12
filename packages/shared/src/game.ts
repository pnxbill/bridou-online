import type { Card, HandCard } from './cards'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 7
export const MAX_CARDS_PER_PLAYER = 7
export const TOTAL_ROUNDS = 13

/** Wire placeholder for a player's own card on the last (blind) round. */
export const HIDDEN_CARD = 'hidden'

/** Last round: you see everyone else's card, not your own. */
export const isBlindRound = (roundNumber: number): boolean => roundNumber === TOTAL_ROUNDS

export interface PlayerInfo {
  id: string
  name: string
  photoURL?: string
  /** Seat played by the machine from the start — always shown as a bot. */
  isBot?: boolean
}

/** A player as everyone may see them inside a round — never includes their hand. */
export interface RoundPlayer extends PlayerInfo {
  bet: number | null
  made: number | null
  points: number | null
}

export interface ScoreboardEntry extends PlayerInfo {
  totalPoints: number
}

/** One trick. `players` is in play order; the player at index `playedCards.length` acts next. */
export interface TurnSnapshot {
  players: RoundPlayer[]
  suit: string | null
  playedCards: Card[]
  trunfo: Card
}

export interface RoundSnapshot {
  currentRoundNumber: number
  cardsForEachPlayer: number
  numOfPlayers: number
  trunfo: Card
  /** In betting order; the player at `currentPlayerIndex` bets next while `betting`. */
  players: RoundPlayer[]
  betting: boolean
  turns: TurnSnapshot[]
  currentTurn: TurnSnapshot | null
  /** Winner of each completed trick, in order. */
  whoMade: RoundPlayer[]
  /** Players who missed their bet this round (set when the round ends). */
  bailadores: RoundPlayer[]
}

export interface GameSnapshot {
  id: string
  leaderId: string
  currentRoundNumber: number
  scoreboardShowing: boolean
  /** All 13 rounds played — the scoreboard is final. */
  finished: boolean
  currentRound: RoundSnapshot
  scoreboard: ScoreboardEntry[]
}

/** What a specific player is allowed to do right now — sent only to them. */
export interface PlayerPerspective {
  playableCards: HandCard[]
  availableBets: number[]
  /**
   * Other players' hands on the blind (last) round only. Empty/absent otherwise.
   * Never includes the viewer's own cards.
   */
  opponentHands?: Record<string, Card[]>
}

/** A seat whose player left: the game is paused until `resumeAt` (epoch ms). */
export interface AbandonedSeat {
  playerId: string
  resumeAt: number
}

/** Seat-control state kept by the server session, included in game snapshots. */
export interface SessionState {
  abandoned: AbandonedSeat[]
  /** Seats currently played by the bot. */
  botSeats: string[]
}
