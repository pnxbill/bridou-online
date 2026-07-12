'use client'

/**
 * Dev-only motion playground — drives the REAL GameTable through the REAL
 * reducer with scripted DomainEvents, no server. Made for motion pass v2:
 * "Distribuir" replays the dealing animation, and tapping a card twice shows
 * it traveling from the fan to the table. Opponents auto-play, tricks resolve
 * and fly to the winner (same 1.5s pacing as the engine).
 * Header-free on purpose (outside the (main) group), like the game route.
 */
import type { Card, HandCard, RoundPlayer, TurnSnapshot } from '@bridou/shared'
import { useEffect, useReducer, useRef } from 'react'
import { winningCardIndex } from '@/features/game/cards'
import { GameTable } from '@/features/game/components/GameTable'
import { gameReducer, type GameViewState } from '@/features/game/reducer'

const player = (id: string, name: string, isBot = false): RoundPlayer => ({
  id,
  name,
  isBot,
  bet: 1,
  made: null,
  points: null,
})

const PLAYERS = [
  player('me', 'Você'),
  player('p1', 'Ana'),
  player('p2', 'Bot Marley', true),
  player('p3', 'Rafa'),
]
const TRUNFO: Card = 'Q-♥️'

const MY_HAND: Card[] = ['A-♠️', 'K-♥️', '7-♦️', 'J-♣️', '3-♠️']
const OPP_HANDS: Record<string, Card[]> = {
  p1: ['9-♠️', '2-♥️', 'K-♦️', '5-♣️', '10-♠️'],
  p2: ['4-♠️', 'J-♥️', 'A-♦️', 'Q-♣️', '6-♠️'],
  p3: ['Q-♠️', '7-♥️', '2-♦️', 'K-♣️', '8-♠️'],
}

const IDLE: GameViewState = {
  myId: 'me',
  leaderId: 'me',
  roundNumber: 5,
  players: PLAYERS,
  trunfo: TRUNFO,
  cardsForEachPlayer: 5,
  betting: false,
  hand: [],
  dealSeq: 0,
  availableBets: [],
  playedCards: [],
  currentTurn: null,
  turnsCompleted: 0,
  madeByPlayer: {},
  lastTrickWinnerId: null,
  bailadores: [],
  lastRoundResult: null,
  scoreboard: null,
  gameOver: false,
  abandoned: [],
  botSeats: [],
  opponentHands: {},
}

const turnSnapshot = (playedCards: Card[]): TurnSnapshot => ({
  players: PLAYERS,
  suit: playedCards[0]?.split('-')[1] ?? null,
  playedCards,
  trunfo: TRUNFO,
})

export default function MotionDevPage() {
  const [state, dispatch] = useReducer(gameReducer, IDLE)

  const myCards = useRef<Card[]>([])
  const oppCards = useRef<Record<string, Card[]>>({})
  const trick = useRef<Card[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms))

  const startTurn = () => {
    trick.current = []
    dispatch({ type: 'apply-event', event: { type: 'turn-started', turn: turnSnapshot([]) } })
    dispatch({
      type: 'apply-event',
      event: {
        type: 'play-requested',
        playerId: 'me',
        cards: myCards.current.map((value) => ({ value, disabled: false })),
      },
    })
  }

  const deal = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    myCards.current = [...MY_HAND]
    oppCards.current = Object.fromEntries(Object.entries(OPP_HANDS).map(([id, c]) => [id, [...c]]))

    dispatch({
      type: 'apply-event',
      event: {
        type: 'round-started',
        round: {
          currentRoundNumber: 5,
          cardsForEachPlayer: 5,
          numOfPlayers: PLAYERS.length,
          trunfo: TRUNFO,
          players: PLAYERS,
          betting: true,
          turns: [],
          currentTurn: null,
          whoMade: [],
          bailadores: [],
        },
      },
    })
    dispatch({ type: 'apply-event', event: { type: 'cards-dealt', playerId: 'me', cards: MY_HAND } })
    // let the cards land in the fan, then open the first trick
    later(MY_HAND.length * 130 + 600, startTurn)
  }

  const playCard = (card: HandCard) => {
    dispatch({ type: 'lock-hand' })
    myCards.current = myCards.current.filter((c) => c !== card.value)
    trick.current = [...trick.current, card.value]
    dispatch({
      type: 'apply-event',
      event: {
        type: 'card-played',
        playerId: 'me',
        card: card.value,
        playedCards: [...trick.current],
      },
    })

    // opponents follow, one every 700ms, then the trick resolves
    PLAYERS.slice(1).forEach((opp, i) => {
      later(700 * (i + 1), () => {
        const next = oppCards.current[opp.id]?.shift()
        if (!next) return
        trick.current = [...trick.current, next]
        dispatch({
          type: 'apply-event',
          event: {
            type: 'card-played',
            playerId: opp.id,
            card: next,
            playedCards: [...trick.current],
          },
        })
      })
    })
    later(700 * PLAYERS.length, () => {
      const winner = PLAYERS[winningCardIndex(trick.current, TRUNFO)] ?? PLAYERS[0]!
      dispatch({
        type: 'apply-event',
        event: { type: 'turn-ended', turn: turnSnapshot(trick.current), winnerId: winner.id },
      })
      // same pacing as the engine's TRICK_RESOLUTION_MS
      if (myCards.current.length > 0) later(1500, startTurn)
    })
  }

  return (
    <>
      <GameTable state={state} onPlay={playCard} onBet={() => {}} />
      <div style={{ position: 'fixed', top: 70, left: 10, zIndex: 50, display: 'flex', gap: 6 }}>
        <button style={toggleStyle} onClick={deal}>
          distribuir
        </button>
      </div>
    </>
  )
}

const toggleStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 8,
  border: '1px dashed rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.4)',
  color: '#94a3b8',
  fontSize: 11,
  cursor: 'pointer',
}
