'use client'

/**
 * Dev-only edge-layout fixture — renders the REAL GameTable with fake state
 * at the crowded extremes: 7 players, 7-card hands, full bet bar.
 * Header-free on purpose (outside the (main) group) so the 100dvh screen
 * matches the real game route exactly.
 */
import type { RoundPlayer } from '@bridou/shared'
import { useState } from 'react'
import { GameTable } from '@/features/game/components/GameTable'
import type { GameViewState } from '@/features/game/reducer'

const player = (id: string, name: string, bet: number | null, isBot = false): RoundPlayer => ({
  id,
  name,
  isBot,
  bet,
  made: null,
  points: null,
})

/* deliberately long names — the truncation has to hold */
const SEVEN: RoundPlayer[] = [
  player('me', 'Você', 2),
  player('p1', 'Ana Beatriz Souza', 1),
  player('p2', 'Bot Marley', 0, true),
  player('p3', 'Rafael Guimarães', 2),
  player('p4', 'Carolzinha', 1),
  player('p5', 'João Pedro Lima', 0),
  player('p6', 'Bot Zeca', 1, true),
]

const FOUR = SEVEN.slice(0, 4)

const PLAYED = ['9-♠️', 'K-♠️', '3-♠️', 'Q-♦️', 'A-♠️', '5-♠️']

const HAND7 = ['2-♠️', '7-♠️', 'J-♥️', '4-♦️', '10-♣️', '6-♥️', 'Q-♣️'].map((value, i) => ({
  value,
  disabled: i % 3 === 1,
}))

function makeState(players: RoundPlayer[], betting: boolean): GameViewState {
  const opponents = players.slice(1)
  return {
    myId: 'me',
    leaderId: 'me',
    roundNumber: 7,
    players,
    trunfo: 'Q-♥️',
    cardsForEachPlayer: 7,
    betting,
    hand: betting ? HAND7.map((c) => ({ ...c, disabled: true })) : HAND7,
    dealSeq: 0,
    availableBets: betting ? [0, 1, 2, 3, 4, 5, 6, 8] : [],
    playedCards: betting ? [] : PLAYED.slice(0, opponents.length),
    currentTurn: betting
      ? null
      : {
          players: [...opponents, players[0]!],
          suit: '♠️',
          playedCards: PLAYED.slice(0, opponents.length),
          trunfo: 'Q-♥️',
        },
    turnsCompleted: 2,
    madeByPlayer: { p1: 1, p3: 1, me: 0 },
    lastTrickWinnerId: null,
    bailadores: [],
    lastRoundResult: null,
    scoreboard: null,
    gameOver: false,
    abandoned: [],
    botSeats: [],
  }
}

export default function EdgeLayoutFixturePage() {
  const [seven, setSeven] = useState(true)
  const [betting, setBetting] = useState(false)

  const state = makeState(seven ? SEVEN : FOUR, betting)

  return (
    <>
      <GameTable state={state} onPlay={() => {}} onBet={() => {}} />
      <div style={{ position: 'fixed', top: 70, left: 10, zIndex: 50, display: 'flex', gap: 6 }}>
        <button style={toggleStyle} onClick={() => setSeven((v) => !v)}>
          {seven ? '7 jogadores' : '4 jogadores'}
        </button>
        <button style={toggleStyle} onClick={() => setBetting((v) => !v)}>
          {betting ? 'apostando' : 'jogando'}
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
