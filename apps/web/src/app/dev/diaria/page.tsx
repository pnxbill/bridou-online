'use client'

/**
 * Dev-only Mão do Dia fixture — the REAL table and the REAL result overlay on
 * a scripted hand, so the daily's look can be iterated without burning the
 * one attempt a real account gets per day (and without a signed-in session).
 *
 * Outside the (main) group with the floating menu button, so the 100dvh
 * screen matches the real /diaria route exactly.
 */
import type { DailyLeaderboardRow, DailyResult, RoundPlayer } from '@bridou/shared'
import { useState } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { DailyResultBar, DailyResultOverlay } from '@/features/daily/DailyResultOverlay'
import { GameTable } from '@/features/game/components/GameTable'
import type { GameViewState } from '@/features/game/reducer'

const seat = (id: string, name: string, bet: number, made: number, isBot = false): RoundPlayer => ({
  id,
  name,
  isBot,
  bet,
  made,
  points: null,
})

const SEATS: RoundPlayer[] = [
  seat('daily-you', 'Você', 2, 2),
  seat('daily-bot-1', 'Botelho', 1, 1, true),
  seat('daily-bot-2', 'Robertinho', 0, 1, true),
  seat('daily-bot-3', 'Bot Marley', 1, 1, true),
]

const TRUNFO = 'Q-♥️'
const HAND = ['6-♠️', '3-♣️', 'K-♣️', '3-♠️', '9-♣️']
const PLAYED = ['K-♣️', '4-♣️', 'A-♣️']

const makeState = (betting: boolean): GameViewState => ({
  myId: 'daily-you',
  leaderId: 'daily-you',
  roundNumber: 5,
  players: SEATS,
  trunfo: TRUNFO,
  cardsForEachPlayer: 5,
  betting,
  hand: HAND.map((value, i) => ({ value, disabled: betting || i === 0 })),
  dealSeq: 0,
  availableBets: betting ? [0, 1, 2, 3, 4, 5] : [],
  playedCards: betting ? [] : PLAYED,
  currentTurn: betting
    ? null
    : { players: SEATS, suit: '♣️', playedCards: PLAYED, trunfo: TRUNFO },
  turnsCompleted: 2,
  madeByPlayer: { 'daily-you': 1, 'daily-bot-1': 1 },
  lastTrickWinnerId: null,
  bailadores: [],
  lastRoundResult: null,
  // the Mão do Dia plays without a baseado — nobody to pass it to
  baseadoHolderId: null,
  scoreboard: null,
  gameOver: false,
  abandoned: [],
  botSeats: [],
  opponentHands: {},
  completedTricks: [],
  toasts: [],
  pausedBy: null,
})

const RESULT: Record<'cravou' | 'bailou', DailyResult> = {
  cravou: {
    bet: 2,
    made: 2,
    points: 12,
    exact: true,
    trickWins: [true, false, true, false, false],
    par: 13,
    finishedAt: new Date().toISOString(),
  },
  bailou: {
    bet: 3,
    made: 1,
    points: -1,
    exact: false,
    trickWins: [false, true, false, false, false],
    par: 13,
    finishedAt: new Date().toISOString(),
  },
}

/** Your row mirrors whichever outcome is on screen, so the board never lies. */
const boardFor = (result: DailyResult): DailyLeaderboardRow[] =>
  [
    { id: 'p1', name: 'Ana Beatriz Souza', bet: 3, made: 3, points: 13, exact: true },
    { id: 'me', name: 'Você', ...result },
    { id: 'p2', name: 'Rafael Guimarães', bet: 1, made: 1, points: 11, exact: true },
    { id: 'p3', name: 'Carolzinha', bet: 2, made: 0, points: -1, exact: false },
  ]
    .sort((a, b) => b.points - a.points)
    .map((row, i) => ({ ...row, position: i + 1 }))

export default function DiariaFixturePage() {
  const [betting, setBetting] = useState(false)
  const [outcome, setOutcome] = useState<'cravou' | 'bailou' | null>('cravou')
  const [open, setOpen] = useState(true)

  const result = outcome ? RESULT[outcome] : null

  return (
    <>
      <AppHeader variant="floating" />
      <GameTable
        state={makeState(betting)}
        onPlay={() => {}}
        onBet={() => {}}
        roundLabel="Mão do Dia · 28/07 · 🔥 6"
      />

      {result && open && (
        <DailyResultOverlay
          date="2026-07-28"
          result={result}
          leaderboard={boardFor(result)}
          streak={6}
          myId="me"
          onClose={() => setOpen(false)}
        />
      )}
      {result && !open && <DailyResultBar result={result} onOpen={() => setOpen(true)} />}

      <div style={{ position: 'fixed', top: 70, left: 10, zIndex: 60, display: 'flex', gap: 6 }}>
        <button style={toggleStyle} onClick={() => setBetting((v) => !v)}>
          {betting ? 'apostando' : 'jogando'}
        </button>
        <button
          style={toggleStyle}
          onClick={() =>
            setOutcome((v) => (v === 'cravou' ? 'bailou' : v === 'bailou' ? null : 'cravou'))
          }
        >
          {outcome ?? 'sem resultado'}
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
