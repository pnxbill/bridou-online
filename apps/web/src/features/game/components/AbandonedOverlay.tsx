'use client'

import type { AbandonedSeat, RoundPlayer } from '@bridou/shared'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import styles from './Overlays.module.css'

interface Props {
  seats: AbandonedSeat[]
  players: RoundPlayer[]
}

/** The game is paused: calm notice of who left and when the bot takes over. */
export function AbandonedOverlay({ seats, players }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  const nameOf = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? playerId
  const nextResume = Math.max(...seats.map((s) => s.resumeAt))
  const secondsLeft = Math.max(0, Math.ceil((nextResume - now) / 1000))

  return (
    <div className={styles.overlay}>
      <motion.div
        className={styles.panel}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <span className={styles.pausedDot} />
        <h2 className={`${styles.title} ${styles.titleClean}`}>Partida pausada</h2>
        <p className={styles.subtitle}>
          {seats.map((seat) => nameOf(seat.playerId)).join(', ')}{' '}
          {seats.length === 1 ? 'saiu da mesa' : 'saíram da mesa'}
        </p>
        <span className={styles.countdown}>{secondsLeft}</span>
        <p className={styles.subtitle}>
          {secondsLeft > 0 ? 'o bot 🤖 assume se não voltar' : 'o bot 🤖 está assumindo…'}
        </p>
      </motion.div>
    </div>
  )
}
