'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import type { HandCard, RoundPlayer } from '@bridou/shared'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useDeckTheme } from '@/features/settings/deck-theme'
import { parseCard, winningCardIndex } from '../cards'
import type { GameViewState } from '../reducer'
import {
  playBetSound,
  playCardSound,
  playDealSound,
  playRoundOpenSound,
  playTrickEndSound,
  playYourBetTurnSound,
  playYourTurnSound,
  unlockGameAudio,
} from '../sounds'
import { PlayerHand } from './PlayerHand'
import styles from './GameTable.module.css'

interface Props {
  state: GameViewState
  onPlay: (card: HandCard) => void
  onBet: (bet: number) => void
  /** Players talking in voice chat right now — their avatars glow. */
  speakingIds?: string[]
}

/* Felt, seats and played cards share one ellipse (see .felt in the CSS). */
const TABLE = { cx: 50, cy: 46 }
/** Must match `.played` width in the CSS — sizes the fan-to-table scale. */
const PLAYED_CARD_W = 58
const MY_SEAT = { x: 50, y: 88 }
const MY_SLOT = { x: 50, y: 70 }

/**
 * Opponents along the rim, left → right, leaving a gap at the bottom for me.
 * Angles are screen-math (0° east, 90° south): ~130° is lower-left (≈8 o'clock),
 * through the top (~270°) to ~50° lower-right (≈4 o'clock) — so a full table
 * uses the sides, not just the top arc.
 */
const seatAngle = (index: number, count: number) => {
  const start = 130
  const end = 410 // 50° + 360 — wrap past east through the top
  return ((start + ((end - start) * (index + 0.5)) / count) * Math.PI) / 180
}

/** Rounded so SSR and client serialize the same style strings (hydration). */
const round2 = (n: number) => Math.round(n * 100) / 100

const seatPosition = (index: number, count: number) => {
  const angle = seatAngle(index, count)
  return {
    x: round2(TABLE.cx + 43 * Math.cos(angle)),
    y: round2(TABLE.cy + 33 * Math.sin(angle)),
  }
}

const playedPosition = (index: number, count: number) => {
  const angle = seatAngle(index, count)
  return {
    x: round2(TABLE.cx + 24 * Math.cos(angle)),
    y: round2(TABLE.cy + 4 + 15 * Math.sin(angle)),
  }
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

export function GameTable({ state, onPlay, onBet, speakingIds = [] }: Props) {
  const { variant } = useDeckTheme()
  /* px size of the table area — motion deltas are computed from % positions */
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const measure = () => {
      const el = areaRef.current
      if (el) setArea({ w: el.offsetWidth, h: el.offsetHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  /* where each of my played cards sat in the fan when tapped — the card
     travels from there to its slot instead of popping in at my seat */
  const playOrigins = useRef(new Map<string, DOMRect>())
  /** Own play/bet already sounded inside the tap gesture — skip the echo from the event. */
  const localCardSoundPlayed = useRef(false)
  const localBetSoundPlayed = useRef(false)
  const handlePlay = (card: HandCard, origin?: DOMRect) => {
    unlockGameAudio()
    playCardSound()
    localCardSoundPlayed.current = true
    if (origin) playOrigins.current.set(card.value, origin)
    onPlay(card)
  }
  const handleBet = (bet: number) => {
    unlockGameAudio()
    playBetSound()
    localBetSoundPlayed.current = true
    onBet(bet)
  }
  useEffect(() => {
    for (const value of playOrigins.current.keys()) {
      if (!state.playedCards.includes(value)) playOrigins.current.delete(value)
    }
  }, [state.playedCards])

  /* soft SFX: tap on each new card, scoop when the trick leaves the table */
  const prevPlayed = useRef<string[] | null>(null)
  useEffect(() => {
    const prev = prevPlayed.current
    prevPlayed.current = state.playedCards
    if (prev === null) return // skip mount / first paint (resync shouldn't ding)
    if (state.playedCards.length > prev.length) {
      if (localCardSoundPlayed.current) {
        localCardSoundPlayed.current = false
      } else {
        playCardSound()
      }
    } else if (prev.length > 0 && state.playedCards.length === 0) {
      playTrickEndSound()
    }
  }, [state.playedCards])

  useEffect(() => {
    const unlock = () => unlockGameAudio()
    // capture so we unlock even if a child stops propagation
    window.addEventListener('pointerdown', unlock, { capture: true })
    window.addEventListener('keydown', unlock, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [])

  /* rotate the betting order so I'm the seat at the near rim */
  const meIndex = state.players.findIndex((p) => p.id === state.myId)
  const order =
    meIndex <= 0
      ? state.players
      : [...state.players.slice(meIndex), ...state.players.slice(0, meIndex)]
  const me = meIndex === -1 ? undefined : order[0]
  const opponents = meIndex === -1 ? order : order.slice(1)

  const seatPos = new Map<string, { x: number; y: number }>()
  const slotPos = new Map<string, { x: number; y: number }>()
  opponents.forEach((p, i) => {
    seatPos.set(p.id, seatPosition(i, opponents.length))
    slotPos.set(p.id, playedPosition(i, opponents.length))
  })
  if (me) {
    seatPos.set(me.id, MY_SEAT)
    slotPos.set(me.id, MY_SLOT)
  }

  const trickComplete =
    !!state.currentTurn && state.playedCards.length === state.currentTurn.players.length
  const activeId = state.betting
    ? (state.players.find((p) => p.bet === null)?.id ?? null)
    : !trickComplete
      ? (state.currentTurn?.players[state.playedCards.length]?.id ?? null)
      : null
  const myTurn = activeId === state.myId
  const myPlayTurn = myTurn && !state.betting
  const myBetTurn = myTurn && state.betting
  const betsPlaced = state.players.filter((p) => p.bet !== null).length

  /* soft chime when it becomes your turn to play a card — skip first paint */
  const wasMyPlayTurn = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = wasMyPlayTurn.current
    wasMyPlayTurn.current = myPlayTurn
    if (prev === null) return
    if (myPlayTurn && !prev) playYourTurnSound()
  }, [myPlayTurn])

  /* warmer chime when it becomes your turn to bet — skip first paint */
  const wasMyBetTurn = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = wasMyBetTurn.current
    wasMyBetTurn.current = myBetTurn
    if (prev === null) return
    if (myBetTurn && !prev) playYourBetTurnSound()
  }, [myBetTurn])

  /* soft chip click whenever someone places a bet */
  const prevBetsPlaced = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevBetsPlaced.current
    prevBetsPlaced.current = betsPlaced
    if (prev === null) return
    if (betsPlaced > prev) {
      if (localBetSoundPlayed.current) {
        localBetSoundPlayed.current = false
      } else {
        playBetSound()
      }
    }
  }, [betsPlaced])

  /* soft accent when a new round opens — skip first paint / resync */
  const prevRound = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevRound.current
    prevRound.current = state.roundNumber
    if (prev === null) return
    if (state.roundNumber !== prev) playRoundOpenSound()
  }, [state.roundNumber])

  /* soft riffle when cards are dealt into the fan */
  const prevDealSeq = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevDealSeq.current
    prevDealSeq.current = state.dealSeq
    if (prev === null) return
    if (state.dealSeq > prev) playDealSound()
  }, [state.dealSeq])

  const winningIdx = winningCardIndex(state.playedCards, state.trunfo)
  const madeOf = (id: string) => state.madeByPlayer[id] ?? 0
  const isBotSeat = (p: RoundPlayer) => p.isBot || state.botSeats.includes(p.id)

  /* motion helpers: px delta between two % positions */
  const delta = (from: { x: number; y: number }, to: { x: number; y: number }) => ({
    x: ((from.x - to.x) / 100) * area.w,
    y: ((from.y - to.y) / 100) * area.h,
  })
  const winnerSeat = state.lastTrickWinnerId ? seatPos.get(state.lastTrickWinnerId) : undefined

  const seatChip = (p: RoundPlayer, active: boolean) => {
    if (state.betting) {
      if (p.bet === null) {
        return active ? (
          <span className={styles.thinking}>pedindo…</span>
        ) : (
          <span className={styles.seatBet}>–</span>
        )
      }
      return (
        <span className={styles.seatBet}>
          pediu <b>{p.bet}</b>
        </span>
      )
    }
    return (
      <span
        className={`${styles.seatBet} ${madeOf(p.id) >= (p.bet ?? 0) ? styles.seatBetMade : ''}`}
      >
        fez <b>{madeOf(p.id)}</b>/{p.bet ?? 0}
      </span>
    )
  }

  const myChipText = () => {
    if (!me) return null
    if (state.betting) {
      if (myTurn)
        return (
          <>
            <b>Você</b> · quantas faz?
          </>
        )
      return (
        <>
          <b>Você</b> · {me.bet !== null ? `pediu ${me.bet}` : 'aguarde…'}
        </>
      )
    }
    return (
      <>
        <b>Você</b> · fez {madeOf(me.id)}/{me.bet ?? 0}
        {myTurn && ' · sua vez'}
      </>
    )
  }

  return (
    <div className={styles.screen}>
      {/* landscape phones: portrait-only layout, ask for a rotate (CSS decides) */}
      <div className={styles.rotateOverlay}>
        <span className={styles.rotateIcon}>📱</span>
        <span className={styles.rotateText}>Gire o celular</span>
        <span className={styles.rotateSub}>a mesa é jogada em pé</span>
      </div>

      {/* top HUD */}
      <div className={styles.hud}>
        <div className={styles.roundChip}>
          <span className={styles.roundLabel}>Rodada {state.roundNumber}</span>
          <span className={styles.roundValue}>
            Vaza {Math.min(state.turnsCompleted + 1, state.cardsForEachPlayer)}/
            {state.cardsForEachPlayer}
          </span>
        </div>
        {state.trunfo && (
          <div className={styles.trunfo}>
            <span className={styles.trunfoLabel}>Trunfo</span>
            <div className={styles.trunfoCard}>
              <PlayingCard id="trunfo" {...parseCard(state.trunfo)} variant={variant} />
            </div>
          </div>
        )}
      </div>

      {/* table, seats, played cards */}
      <div
        className={styles.tableArea}
        data-crowded={opponents.length >= 5 ? '' : undefined}
        ref={areaRef}
      >
        <div className={styles.felt} />
        <span className={styles.feltLogo}>BRIDOU</span>

        {opponents.map((seat) => {
          const pos = seatPos.get(seat.id)!
          return (
            <div
              key={seat.id}
              className={`${styles.seat} ${seat.id === activeId ? styles.seatActive : ''}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div
                className={`${styles.avatar} ${isBotSeat(seat) ? styles.avatarBot : ''} ${
                  speakingIds.includes(seat.id) ? styles.avatarSpeaking : ''
                }`}
              >
                {isBotSeat(seat) ? '🤖' : seat.photoURL ? (
                  <img src={seat.photoURL} alt="" />
                ) : (
                  initials(seat.name)
                )}
              </div>
              <span className={styles.seatName}>{seat.name}</span>
              {seatChip(seat, seat.id === activeId)}
            </div>
          )
        })}

        <AnimatePresence>
          {state.playedCards.map((card, i) => {
            const owner = state.currentTurn?.players[i]
            const slot = (owner && slotPos.get(owner.id)) ?? { x: 50, y: 46 }
            const from = (owner && seatPos.get(owner.id)) ?? slot
            /* my card starts where it sat in the fan (measured on tap);
               everyone else's enters from their seat */
            const origin = owner?.id === state.myId ? playOrigins.current.get(card) : undefined
            const areaRect = origin ? areaRef.current?.getBoundingClientRect() : undefined
            const enter =
              origin && areaRect
                ? {
                    x: origin.x + origin.width / 2 - (areaRect.left + (slot.x / 100) * areaRect.width),
                    y: origin.y + origin.height / 2 - (areaRect.top + (slot.y / 100) * areaRect.height),
                  }
                : delta(from, slot)
            const enterScale = origin ? origin.width / PLAYED_CARD_W : 0.5
            const exit = winnerSeat ? delta(winnerSeat, slot) : { x: 0, y: 0 }
            const tilt = -7 + (i * 14) / Math.max(1, state.playedCards.length - 1 || 1)
            const winning = i === winningIdx
            return (
              <motion.div
                key={card}
                className={`${styles.played} ${winning ? styles.playedWinning : ''}`}
                style={{ left: `${slot.x}%`, top: `${slot.y}%`, zIndex: winning ? 4 : 3 }}
                initial={{
                  x: enter.x,
                  y: enter.y,
                  opacity: origin ? 1 : 0,
                  scale: enterScale,
                  rotate: tilt,
                }}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: tilt }}
                exit={{
                  x: exit.x,
                  y: exit.y,
                  opacity: 0,
                  scale: 0.35,
                  transition: { duration: 0.45, ease: 'easeIn' },
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <PlayingCard id={card} {...parseCard(card)} variant={variant} />
                {winning && (
                  <span className={styles.winnerTag}>
                    {trickComplete ? 'ganhou!' : 'ganhando'}
                  </span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {me && (
          <div className={styles.mySeat}>
            <span
              className={`${styles.myChip} ${myTurn ? styles.myChipTurn : ''} ${
                speakingIds.includes(me.id) ? styles.myChipSpeaking : ''
              }`}
            >
              {myChipText()}
            </span>
            {state.betting && state.availableBets.length > 0 && (
              <div className={styles.betBar}>
                <div className={styles.betOptions}>
                  {state.availableBets.map((bet) => (
                    <button key={bet} className={styles.betBtn} onClick={() => handleBet(bet)}>
                      {bet}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* thumb zone: hand */}
      <div className={styles.myArea}>
        <PlayerHand cards={state.hand} onPlay={handlePlay} dealSeq={state.dealSeq} />
      </div>
    </div>
  )
}
