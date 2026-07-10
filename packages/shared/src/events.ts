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
  | { type: 'round-ended'; bailadores: RoundPlayer[] }
  // private, per-player
  | { type: 'cards-dealt'; playerId: string; cards: Card[] }
  | { type: 'bet-requested'; playerId: string; availableBets: number[] }
  | { type: 'play-requested'; playerId: string; cards: HandCard[] }
  // betting
  | { type: 'player-bet'; playerId: string; bet: number }
  // tricks
  | { type: 'turn-started'; turn: TurnSnapshot }
  | { type: 'card-played'; playerId: string; card: Card; playedCards: Card[] }
  | { type: 'turn-ended'; turn: TurnSnapshot; winnerId: string }
  // scoring / game end
  | { type: 'scoreboard-shown'; scoreboard: ScoreboardEntry[] }
  | { type: 'scoreboard-hidden' }
  | { type: 'game-ended'; scoreboard: ScoreboardEntry[] }
  // seat control (abandonment): the game pauses until `resumeAt`, then a bot
  // takes the seat; the player reclaims it by coming back
  | { type: 'player-abandoned'; playerId: string; resumeAt: number }
  | { type: 'player-rejoined'; playerId: string }
  | { type: 'bot-took-over'; playerId: string }

export type DomainEventType = DomainEvent['type']

const PRIVATE_EVENTS: ReadonlySet<DomainEventType> = new Set([
  'cards-dealt',
  'bet-requested',
  'play-requested',
])

export type PrivateEvent = Extract<
  DomainEvent,
  { type: 'cards-dealt' | 'bet-requested' | 'play-requested' }
>

export const isPrivateEvent = (event: DomainEvent): event is PrivateEvent =>
  PRIVATE_EVENTS.has(event.type)

/** Where the engine pushes events; implemented by the transport layer. */
export interface EventPublisher {
  publish(event: DomainEvent): void
}
