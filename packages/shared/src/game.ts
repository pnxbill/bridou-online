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
  /** Rounds where the player missed their bet. */
  bailadas: number
  /** Rounds where the player bet 0 — the safe call, so fewer breaks ties. */
  zeroBets: number
}

/**
 * Final standings order: most points, then fewest bailadas, then fewest bets
 * of 0 (bravery breaks ties). Returns 0 only for a genuinely shared place.
 */
export const compareScoreboard = (a: ScoreboardEntry, b: ScoreboardEntry): number =>
  b.totalPoints - a.totalPoints || a.bailadas - b.bailadas || a.zeroBets - b.zeroBets

/** Competition ranks for an already-sorted scoreboard: tied entries share one (1, 1, 3). */
export const scoreboardRanks = (scoreboard: readonly ScoreboardEntry[]): number[] => {
  const ranks: number[] = []
  scoreboard.forEach((entry, i) => {
    const previous = scoreboard[i - 1]
    ranks.push(previous && compareScoreboard(previous, entry) === 0 ? ranks[i - 1]! : i + 1)
  })
  return ranks
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
