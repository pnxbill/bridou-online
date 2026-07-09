import type {
  AbandonedSeat,
  Card,
  DomainEvent,
  HandCard,
  RoundPlayer,
  ScoreboardEntry,
  TurnSnapshot,
} from '@bridou/shared'
import type { GameEntry } from '@/lib/api'

/** Everything the game screen needs, derived purely from snapshot + events. */
export interface GameViewState {
  leaderId: string
  /** Betting order for the current round. */
  players: RoundPlayer[]
  trunfo: Card
  cardsForEachPlayer: number
  betting: boolean
  /** My hand, with unplayable cards disabled. */
  hand: HandCard[]
  /** Bets I may place right now (empty when it's not my turn to bet). */
  availableBets: number[]
  playedCards: Card[]
  currentTurn: TurnSnapshot | null
  turnsCompleted: number
  /** Non-empty right after a round ends → bailadores overlay. */
  bailadores: RoundPlayer[]
  /** Non-null → scoreboard overlay is visible. */
  scoreboard: ScoreboardEntry[] | null
  /** Seats in their grace period — the game is paused while any exist. */
  abandoned: AbandonedSeat[]
  /** Seats currently played by the bot. */
  botSeats: string[]
}

export type GameAction =
  | { type: 'apply-event'; event: DomainEvent }
  /** Full resync — used on reconnect and to recover from a rejected action. */
  | { type: 'sync'; snapshot: GameEntry }
  /** Optimistic UI: freeze the hand while a play is in flight. */
  | { type: 'lock-hand' }
  /** Optimistic UI: hide bet buttons while a bet is in flight. */
  | { type: 'clear-bets' }

export const stateFromSnapshot = (snapshot: GameEntry): GameViewState => ({
  leaderId: snapshot.leaderId,
  players: snapshot.currentRound.players,
  trunfo: snapshot.currentRound.trunfo,
  cardsForEachPlayer: snapshot.currentRound.cardsForEachPlayer,
  betting: snapshot.currentRound.betting,
  hand: snapshot.playableCards,
  availableBets: snapshot.availableBets,
  playedCards: snapshot.currentRound.currentTurn?.playedCards ?? [],
  currentTurn: snapshot.currentRound.currentTurn,
  turnsCompleted: snapshot.currentRound.turns.length,
  bailadores: snapshot.currentRound.bailadores,
  scoreboard: snapshot.scoreboardShowing ? snapshot.scoreboard : null,
  abandoned: snapshot.abandoned ?? [],
  botSeats: snapshot.botSeats ?? [],
})

const applyEvent = (state: GameViewState, event: DomainEvent): GameViewState => {
  switch (event.type) {
    case 'round-started':
      return {
        ...state,
        players: event.round.players,
        trunfo: event.round.trunfo,
        cardsForEachPlayer: event.round.cardsForEachPlayer,
        betting: true,
        hand: [],
        availableBets: [],
        playedCards: [],
        currentTurn: null,
        turnsCompleted: 0,
        bailadores: [],
      }
    case 'trunfo-set':
      return { ...state, trunfo: event.trunfo }
    case 'cards-dealt':
      return { ...state, hand: event.cards.map((value) => ({ value, disabled: true })) }
    case 'bet-requested':
      return { ...state, availableBets: event.availableBets }
    case 'play-requested':
      return { ...state, hand: event.cards }
    case 'player-bet':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === event.playerId ? { ...p, bet: event.bet } : p,
        ),
      }
    case 'turn-started':
      return {
        ...state,
        betting: false,
        currentTurn: event.turn,
        playedCards: event.turn.playedCards,
      }
    case 'card-played':
      return { ...state, playedCards: event.playedCards }
    case 'turn-ended':
      return {
        ...state,
        currentTurn: event.turn,
        turnsCompleted: state.turnsCompleted + 1,
      }
    case 'round-ended':
      return { ...state, bailadores: event.bailadores, playedCards: [] }
    case 'scoreboard-shown':
    case 'game-ended':
      return { ...state, scoreboard: event.scoreboard, bailadores: [] }
    case 'scoreboard-hidden':
      return { ...state, scoreboard: null }
    case 'player-abandoned':
      return {
        ...state,
        abandoned: [
          ...state.abandoned.filter((a) => a.playerId !== event.playerId),
          { playerId: event.playerId, resumeAt: event.resumeAt },
        ],
      }
    case 'player-rejoined':
      return {
        ...state,
        abandoned: state.abandoned.filter((a) => a.playerId !== event.playerId),
        botSeats: state.botSeats.filter((id) => id !== event.playerId),
      }
    case 'bot-took-over':
      return {
        ...state,
        abandoned: state.abandoned.filter((a) => a.playerId !== event.playerId),
        botSeats: state.botSeats.includes(event.playerId)
          ? state.botSeats
          : [...state.botSeats, event.playerId],
      }
    default:
      // Future events (e.g. player-abandoned) are ignored until the UI learns them
      return state
  }
}

export const gameReducer = (state: GameViewState, action: GameAction): GameViewState => {
  switch (action.type) {
    case 'apply-event':
      return applyEvent(state, action.event)
    case 'sync':
      return stateFromSnapshot(action.snapshot)
    case 'lock-hand':
      return { ...state, hand: state.hand.map((c) => ({ ...c, disabled: true })) }
    case 'clear-bets':
      return { ...state, availableBets: [] }
  }
}
