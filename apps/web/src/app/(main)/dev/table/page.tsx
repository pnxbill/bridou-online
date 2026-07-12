'use client'

/**
 * Dev-only mockup of the "noite de jogo" game table — fake data, no server.
 * This is the design reference for the real game screen: seats around the
 * felt, played cards traveling to the center, hand in the thumb zone.
 */
import { Card as PlayingCard } from '@bridou/cards-ui'
import type { HandCard } from '@bridou/shared'
import { useState } from 'react'
import { PlayerHand } from '@/features/game/components/PlayerHand'
import { parseCard } from '@/features/game/cards'
import styles from './table.module.css'

interface MockSeat {
  name: string
  isBot?: boolean
  bet: number | null
  made: number
  played?: string
  winning?: boolean
  active?: boolean
}

const PLAYING: MockSeat[] = [
  { name: 'Ana', bet: 1, made: 1, played: 'Q-♠️', winning: true },
  { name: 'Bot Marley', isBot: true, bet: 0, made: 0, played: '5-♠️' },
  { name: 'Rafa', bet: 2, made: 0, played: '9-♠️' },
  { name: 'Carol', bet: 1, made: 0, active: true },
]

// my turn to bet: Ana and the bot already asked, Rafa and Carol wait after me
const BETTING: MockSeat[] = [
  { name: 'Ana', bet: 1, made: 0 },
  { name: 'Bot Marley', isBot: true, bet: 0, made: 0 },
  { name: 'Rafa', bet: null, made: 0 },
  { name: 'Carol', bet: null, made: 0 },
]

const HAND_PLAYING: HandCard[] = [
  { value: '3-♠️', disabled: false },
  { value: 'K-♠️', disabled: false },
  { value: '5-♥️', disabled: true },
  { value: 'A-♦️', disabled: true },
  { value: '10-♣️', disabled: true },
]

const HAND_BETTING: HandCard[] = HAND_PLAYING.map((c) => ({ ...c, disabled: true }))

/* The felt is an ellipse centered at (50%, 46%) — see .felt in the CSS.
   Seats sit on its rim; played cards on a smaller inner ellipse. */
const TABLE = { cx: 50, cy: 46 }

const seatAngle = (index: number, count: number) => {
  const start = 130
  const end = 410 // 50° + 360 — wrap past east through the top
  return ((start + ((end - start) * (index + 0.5)) / count) * Math.PI) / 180
}

/** Positions along the rim left → right, using the sides as well as the top. */
const seatPosition = (index: number, count: number) => {
  const angle = seatAngle(index, count)
  return {
    x: TABLE.cx + 43 * Math.cos(angle),
    y: TABLE.cy + 33 * Math.sin(angle),
  }
}

/** Played card sits between the seat and the center of the felt. */
const playedPosition = (index: number, count: number) => {
  const angle = seatAngle(index, count)
  return {
    x: TABLE.cx + 24 * Math.cos(angle),
    y: TABLE.cy + 4 + 15 * Math.sin(angle),
  }
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

export default function TableMockupPage() {
  const [phase, setPhase] = useState<'playing' | 'betting'>('playing')
  const seats = phase === 'playing' ? PLAYING : BETTING
  const hand = phase === 'playing' ? HAND_PLAYING : HAND_BETTING
  const myTurn = phase === 'playing'

  return (
    <div className={styles.screen}>
      {/* top HUD */}
      <div className={styles.hud}>
        <div className={styles.roundChip}>
          <span className={styles.roundLabel}>Rodada 3</span>
          <span className={styles.roundValue}>Vaza 1/3</span>
        </div>
        <div className={styles.trunfo}>
          <span className={styles.trunfoLabel}>Trunfo</span>
          <div className={styles.trunfoCard}>
            <PlayingCard id="trunfo" {...parseCard('7-♥️')} variant="dark" />
          </div>
        </div>
      </div>

      {/* table + seats */}
      <div className={styles.tableArea}>
        <div className={styles.felt} />
        <span className={styles.feltLogo}>BRIDOU</span>

        {seats.map((seat, i) => {
          const pos = seatPosition(i, seats.length)
          return (
            <div
              key={seat.name}
              className={`${styles.seat} ${seat.active ? styles.seatActive : ''}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className={`${styles.avatar} ${seat.isBot ? styles.avatarBot : ''}`}>
                {seat.isBot ? '🤖' : initials(seat.name)}
              </div>
              <span className={styles.seatName}>{seat.name}</span>
              {seat.bet === null ? (
                seat.active ? (
                  <span className={styles.thinking}>pedindo…</span>
                ) : (
                  <span className={styles.seatBet}>–</span>
                )
              ) : phase === 'betting' ? (
                <span className={styles.seatBet}>
                  pediu <b>{seat.bet}</b>
                </span>
              ) : (
                <span
                  className={`${styles.seatBet} ${seat.made >= (seat.bet ?? 0) ? styles.seatBetMade : ''}`}
                >
                  fez <b>{seat.made}</b>/{seat.bet}
                </span>
              )}
            </div>
          )
        })}

        {/* my seat chip sits on the near rim of the table */}
        <div className={styles.mySeat}>
          <span className={`${styles.myChip} ${myTurn ? styles.myChipTurn : ''}`}>
            {phase === 'betting' ? (
              <>
                <b>Você</b> · quantas faz?
              </>
            ) : (
              <>
                <b>Você</b> · fez 0/1 · sua vez
              </>
            )}
          </span>
        </div>

        {seats.map((seat, i) => {
          if (!seat.played) return null
          const pos = playedPosition(i, seats.length)
          const tilt = -6 + (i * 12) / Math.max(1, seats.length - 1)
          return (
            <div
              key={`played-${seat.name}`}
              className={`${styles.played} ${seat.winning ? styles.playedWinning : ''}`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
                zIndex: seat.winning ? 4 : 3,
              }}
            >
              <PlayingCard id={seat.played} {...parseCard(seat.played)} variant="dark" />
              {seat.winning && <span className={styles.winnerTag}>ganhando</span>}
            </div>
          )
        })}
      </div>

      {/* my area — thumb zone */}
      <div className={styles.myArea}>
        {phase === 'betting' && (
          <div className={styles.betBar}>
            <div className={styles.betOptions}>
              {[0, 1, 2, 3].map((bet) => (
                <button key={bet} className={styles.betBtn}>
                  {bet}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.handWrap}>
          <PlayerHand cards={hand} onPlay={() => {}} />
        </div>
      </div>

      <button
        className={styles.devToggle}
        onClick={() => setPhase((p) => (p === 'playing' ? 'betting' : 'playing'))}
      >
        fase: {phase}
      </button>
    </div>
  )
}
