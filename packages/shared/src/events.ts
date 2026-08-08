import type { Card, HandCard } from './cards'
import type { RoundPlayer, RoundSnapshot, ScoreboardEntry, TurnSnapshot } from './game'

/**
 * Everything the game engine has to say to the outside world.
 *
 * Some events are PRIVATE (see `isPrivateEvent`) — deliver them only to the
 * player in their `playerId` field, since they may contain that player's hand.
 * Everything else is broadcast to the whole game. The transport layer
 * (socket.io today, SSE tomorrow) is the one that decides *how* to deliver;
 * the engine only decides *what* happened.
 */
export type DomainEvent =
  // round lifecycle
  | { type: 'round-started'; round: RoundSnapshot }
  | { type: 'trunfo-set'; trunfo: Card }
  /**
   * `players` is the whole table as it finished, so a client can explain the
   * round without recomputing the scoring (baseado included). Optional because
   * logs recorded before it existed don't carry it.
   */
  | { type: 'round-ended'; bailadores: RoundPlayer[]; players?: RoundPlayer[] }
  // private, per-player
  | { type: 'cards-dealt'; playerId: string; cards: Card[] }
  /** Blind round only: everyone else's cards, never the viewer's. */
  | { type: 'opponent-hands'; playerId: string; hands: Record<string, Card[]> }
  | { type: 'bet-requested'; playerId: string; availableBets: number[] }
  | { type: 'play-requested'; playerId: string; cards: HandCard[] }
  // betting
  | { type: 'player-bet'; playerId: string; bet: number }
  // tricks
  | { type: 'turn-started'; turn: TurnSnapshot }
  | { type: 'card-played'; playerId: string; card: Card; playedCards: Card[] }
  | { type: 'turn-ended'; turn: TurnSnapshot; winnerId: string }
  // o baseado — the blunt going around the table (see baseado.ts). Engine
  // events: it burns on the round's own clock, so no wall clock is involved.
  /** It changed hands. `fromPlayerId` is null when the round lights it. */
  | { type: 'baseado-passed'; fromPlayerId: string | null; toPlayerId: string }
  /** A trick resolved in someone's hands — one more tragada on their tab. */
  | { type: 'baseado-puffed'; playerId: string; tragadas: number }
  // scoring / game end
  | { type: 'scoreboard-shown'; scoreboard: ScoreboardEntry[] }
  | { type: 'scoreboard-hidden' }
  | { type: 'game-ended'; scoreboard: ScoreboardEntry[] }
  // seat control (abandonment): the game pauses until `resumeAt`, then a bot
  // takes the seat; the player reclaims it by coming back
  | { type: 'player-abandoned'; playerId: string; resumeAt: number }
  | { type: 'player-rejoined'; playerId: string }
  | { type: 'bot-took-over'; playerId: string }
  // table-level social events. Published by the SERVER, never the engine —
  // they carry a clock and the engine has none.
  /** A conquista was earned; the whole table sees it land. */
  | { type: 'achievement-unlocked'; playerId: string; achievementId: string; at: number }
  /** A provocação fired from the reaction wheel. */
  | { type: 'emote-sent'; playerId: string; emoteId: string; at: number }
  /** The table paused the game on purpose (distinct from an abandonment pause). */
  | { type: 'game-paused'; byPlayerId: string }
  | { type: 'game-resumed'; byPlayerId: string }

export type DomainEventType = DomainEvent['type']

const PRIVATE_EVENTS: ReadonlySet<DomainEventType> = new Set([
  'cards-dealt',
  'opponent-hands',
  'bet-requested',
  'play-requested',
])

export type PrivateEvent = Extract<
  DomainEvent,
  { type: 'cards-dealt' | 'opponent-hands' | 'bet-requested' | 'play-requested' }
>

export const isPrivateEvent = (event: DomainEvent): event is PrivateEvent =>
  PRIVATE_EVENTS.has(event.type)

/** Where the engine pushes events; implemented by the transport layer. */
export interface EventPublisher {
  publish(event: DomainEvent): void
}
