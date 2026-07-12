import type { DomainEvent, RoundPlayer, RoundSnapshot, TurnSnapshot } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/lib/api'
import { gameReducer, stateFromSnapshot, type GameViewState } from './reducer'

const player = (id: string, bet: number | null = null): RoundPlayer => ({
  id,
  name: id,
  bet,
  made: null,
  points: null,
})

const roundSnapshot = (overrides: Partial<RoundSnapshot> = {}): RoundSnapshot => ({
  currentRoundNumber: 3,
  cardsForEachPlayer: 3,
  numOfPlayers: 2,
  trunfo: '7-♦️',
  players: [player('me'), player('other')],
  betting: true,
  turns: [],
  currentTurn: null,
  whoMade: [],
  bailadores: [],
  ...overrides,
})

const snapshot = (overrides: Partial<GameEntry> = {}): GameEntry => ({
  id: 'g1',
  leaderId: 'me',
  currentRoundNumber: 3,
  scoreboardShowing: false,
  finished: false,
  currentRound: roundSnapshot(),
  scoreboard: [],
  playableCards: [{ value: 'A-♠️', disabled: true }],
  availableBets: [0, 1, 2, 3],
  abandoned: [],
  botSeats: [],
  time: 0,
  ...overrides,
})

const turn = (playedCards: string[] = []): TurnSnapshot => ({
  players: [player('me', 1), player('other', 0)],
  suit: playedCards.length ? '♠️' : null,
  playedCards,
  trunfo: '7-♦️',
})

const apply = (state: GameViewState, event: DomainEvent) =>
  gameReducer(state, { type: 'apply-event', event })

describe('stateFromSnapshot', () => {
  it('derives the full view from an enter-game snapshot', () => {
    const state = stateFromSnapshot(snapshot())
    expect(state.hand).toEqual([{ value: 'A-♠️', disabled: true }])
    expect(state.availableBets).toEqual([0, 1, 2, 3])
    expect(state.betting).toBe(true)
    expect(state.scoreboard).toBeNull()
  })

  it('shows the scoreboard when the snapshot says so', () => {
    const board = [{ id: 'me', name: 'me', totalPoints: 12 }]
    const state = stateFromSnapshot(snapshot({ scoreboardShowing: true, scoreboard: board }))
    expect(state.scoreboard).toEqual(board)
  })

  it('recovers mid-turn state (reconnect during a trick)', () => {
    const state = stateFromSnapshot(
      snapshot({
        currentRound: roundSnapshot({ betting: false, currentTurn: turn(['K-♠️']), turns: [turn()] }),
      }),
    )
    expect(state.playedCards).toEqual(['K-♠️'])
    expect(state.turnsCompleted).toBe(1)
  })
})

describe('round lifecycle', () => {
  const base = stateFromSnapshot(snapshot())

  it('round-started resets the table but keeps identity fields', () => {
    const dirty: GameViewState = {
      ...base,
      playedCards: ['A-♠️'],
      bailadores: [player('other')],
      turnsCompleted: 3,
    }
    const state = apply(dirty, {
      type: 'round-started',
      round: roundSnapshot({ cardsForEachPlayer: 4, trunfo: '2-♣️' }),
    })
    expect(state.playedCards).toEqual([])
    expect(state.bailadores).toEqual([])
    expect(state.turnsCompleted).toBe(0)
    expect(state.betting).toBe(true)
    expect(state.cardsForEachPlayer).toBe(4)
    expect(state.trunfo).toBe('2-♣️')
    expect(state.leaderId).toBe('me')
  })

  it('cards-dealt fills my hand, disabled until asked to play', () => {
    const state = apply(base, { type: 'cards-dealt', playerId: 'me', cards: ['A-♠️', '2-♥️'] })
    expect(state.hand).toEqual([
      { value: 'A-♠️', disabled: true },
      { value: '2-♥️', disabled: true },
    ])
  })

  it('bumps dealSeq on every deal so the UI animates each one', () => {
    let state = apply(base, { type: 'cards-dealt', playerId: 'me', cards: ['A-♠️'] })
    expect(state.dealSeq).toBe(1)
    state = apply(state, { type: 'cards-dealt', playerId: 'me', cards: ['2-♥️', '3-♣️'] })
    expect(state.dealSeq).toBe(2)
  })

  it('a resync keeps dealSeq — reconnecting is not a new deal', () => {
    const dealt = apply(base, { type: 'cards-dealt', playerId: 'me', cards: ['A-♠️'] })
    const state = gameReducer(dealt, { type: 'sync', snapshot: snapshot() })
    expect(state.dealSeq).toBe(1)
  })

  it('round-ended surfaces the result but keeps the final trick on the table', () => {
    const state = apply(
      { ...base, playedCards: ['A-♠️'] },
      { type: 'round-ended', bailadores: [player('other')] },
    )
    expect(state.bailadores.map((b) => b.id)).toEqual(['other'])
    expect(state.lastRoundResult).toEqual({ round: 3, bailadores: [player('other')] })
    expect(state.playedCards).toEqual(['A-♠️']) // cleared on round-started

    const next = apply(state, { type: 'round-started', round: roundSnapshot() })
    expect(next.playedCards).toEqual([])
    expect(next.lastRoundResult).toBeNull()
  })

  it('records a round result even when nobody bailou', () => {
    const state = apply(base, { type: 'round-ended', bailadores: [] })
    expect(state.lastRoundResult).toEqual({ round: 3, bailadores: [] })
  })
})

describe('betting', () => {
  const base = stateFromSnapshot(snapshot())

  it('bet-requested exposes my options; player-bet records everyone', () => {
    let state = apply(base, { type: 'bet-requested', playerId: 'me', availableBets: [0, 2] })
    expect(state.availableBets).toEqual([0, 2])

    state = apply(state, { type: 'player-bet', playerId: 'other', bet: 1 })
    expect(state.players.find((p) => p.id === 'other')?.bet).toBe(1)
    expect(state.players.find((p) => p.id === 'me')?.bet).toBeNull()
  })

  it('turn-started closes the betting phase', () => {
    const state = apply(base, { type: 'turn-started', turn: turn() })
    expect(state.betting).toBe(false)
    expect(state.currentTurn).not.toBeNull()
  })
})

describe('tricks', () => {
  const base = stateFromSnapshot(snapshot())

  it('play-requested unlocks my playable cards', () => {
    const state = apply(base, {
      type: 'play-requested',
      playerId: 'me',
      cards: [
        { value: 'A-♠️', disabled: false },
        { value: '2-♥️', disabled: true },
      ],
    })
    expect(state.hand[0]?.disabled).toBe(false)
    expect(state.hand[1]?.disabled).toBe(true)
  })

  it('card-played updates the table; turn-ended bumps the counter', () => {
    let state = apply(base, {
      type: 'card-played',
      playerId: 'other',
      card: 'K-♠️',
      playedCards: ['K-♠️'],
    })
    expect(state.playedCards).toEqual(['K-♠️'])

    state = apply(state, { type: 'turn-ended', turn: turn(['K-♠️', '3-♠️']), winnerId: 'other' })
    expect(state.turnsCompleted).toBe(1)
  })

  it('tracks tricks made per player and the last winner', () => {
    let state = apply(base, { type: 'turn-ended', turn: turn(['K-♠️', '3-♠️']), winnerId: 'me' })
    state = apply(state, { type: 'turn-ended', turn: turn(['5-♠️', '2-♠️']), winnerId: 'me' })
    state = apply(state, { type: 'turn-ended', turn: turn(['A-♠️', '9-♠️']), winnerId: 'other' })

    expect(state.madeByPlayer).toEqual({ me: 2, other: 1 })
    expect(state.lastTrickWinnerId).toBe('other')

    // next round wipes the counts
    state = apply(state, { type: 'round-started', round: roundSnapshot() })
    expect(state.madeByPlayer).toEqual({})
    expect(state.lastTrickWinnerId).toBeNull()
  })

  it('rebuilds made counts from a reconnect snapshot', () => {
    const state = stateFromSnapshot(
      snapshot({
        currentRound: roundSnapshot({
          whoMade: [player('other'), player('me'), player('other')],
        }),
      }),
    )
    expect(state.madeByPlayer).toEqual({ other: 2, me: 1 })
    expect(state.lastTrickWinnerId).toBe('other')
  })
})

describe('scoreboard', () => {
  const base = stateFromSnapshot(snapshot())
  const board = [{ id: 'me', name: 'me', totalPoints: 22 }]

  it('shows on scoreboard-shown and game-ended, hides on scoreboard-hidden', () => {
    let state = apply({ ...base, bailadores: [player('other')] }, { type: 'scoreboard-shown', scoreboard: board })
    expect(state.scoreboard).toEqual(board)
    expect(state.bailadores).toEqual([]) // scoreboard replaces the bailadores overlay

    state = apply(state, { type: 'scoreboard-hidden' })
    expect(state.scoreboard).toBeNull()

    state = apply(state, { type: 'game-ended', scoreboard: board })
    expect(state.scoreboard).toEqual(board)
    expect(state.gameOver).toBe(true)
  })

  it('shows the final scoreboard when reconnecting to a finished game', () => {
    const board = [{ id: 'me', name: 'me', totalPoints: 40 }]
    const state = stateFromSnapshot(snapshot({ finished: true, scoreboard: board }))
    expect(state.scoreboard).toEqual(board)
    expect(state.gameOver).toBe(true)
  })
})

describe('optimistic UI actions', () => {
  const base = stateFromSnapshot(snapshot())

  it('lock-hand disables everything until the server answers', () => {
    const withHand = apply(base, {
      type: 'play-requested',
      playerId: 'me',
      cards: [{ value: 'A-♠️', disabled: false }],
    })
    const state = gameReducer(withHand, { type: 'lock-hand' })
    expect(state.hand.every((c) => c.disabled)).toBe(true)
  })

  it('clear-bets hides the bet buttons', () => {
    const state = gameReducer(base, { type: 'clear-bets' })
    expect(state.availableBets).toEqual([])
  })

  it('sync replaces the whole state from a fresh snapshot', () => {
    const state = gameReducer(base, {
      type: 'sync',
      snapshot: snapshot({ availableBets: [], scoreboardShowing: true, scoreboard: [] }),
    })
    expect(state.availableBets).toEqual([])
    expect(state.scoreboard).toEqual([])
  })
})

describe('seat control (abandonment)', () => {
  const base = stateFromSnapshot(snapshot())

  it('tracks the abandoned seat and its deadline', () => {
    const state = apply(base, { type: 'player-abandoned', playerId: 'other', resumeAt: 99_000 })
    expect(state.abandoned).toEqual([{ playerId: 'other', resumeAt: 99_000 }])
  })

  it('clears the seat when the player rejoins', () => {
    let state = apply(base, { type: 'player-abandoned', playerId: 'other', resumeAt: 99_000 })
    state = apply(state, { type: 'player-rejoined', playerId: 'other' })
    expect(state.abandoned).toEqual([])
    expect(state.botSeats).toEqual([])
  })

  it('moves the seat to the bot on takeover, and back on rejoin', () => {
    let state = apply(base, { type: 'player-abandoned', playerId: 'other', resumeAt: 99_000 })
    state = apply(state, { type: 'bot-took-over', playerId: 'other' })
    expect(state.abandoned).toEqual([])
    expect(state.botSeats).toEqual(['other'])

    state = apply(state, { type: 'player-rejoined', playerId: 'other' })
    expect(state.botSeats).toEqual([])
  })

  it('restores session state from a reconnect snapshot', () => {
    const state = stateFromSnapshot(
      snapshot({ abandoned: [{ playerId: 'other', resumeAt: 99_000 }], botSeats: ['me'] }),
    )
    expect(state.abandoned).toHaveLength(1)
    expect(state.botSeats).toEqual(['me'])
  })
})

describe('forward compatibility', () => {
  it('ignores events the UI does not know yet', () => {
    const base = stateFromSnapshot(snapshot())
    const unknown = { type: 'some-future-event', playerId: 'other' } as unknown as DomainEvent
    expect(apply(base, unknown)).toEqual(base)
  })
})
