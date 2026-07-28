'use client'

import type { RoundPlayer } from '@bridou/shared'
import { motion } from 'framer-motion'
import styles from './Overlays.module.css'

interface Props {
  pausedBy: string
  players: RoundPlayer[]
  myId: string
  leaderId: string
  onResume: () => void
}

/**
 * A deliberate pause — someone had to step away.
 *
 * Calm on purpose, and visually distinct from the abandonment overlay: that one
 * is an emergency with a countdown, this one is the table agreeing to wait. No
 * timer, no bot takeover, nothing happens until a human says so.
 */
export function PausedOverlay({ pausedBy, players, myId, leaderId, onResume }: Props) {
  const who = players.find((p) => p.id === pausedBy)?.name ?? 'Alguém'
  const canResume = myId === pausedBy || myId === leaderId

  return (
    <div className={styles.overlay}>
      <motion.div
        className={styles.panel}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      >
        <span className={styles.emoji}>☕</span>
        <h2 className={`${styles.title} ${styles.titleClean}`}>PAUSA</h2>
        <p className={styles.subtitle}>
          {pausedBy === myId ? 'Você pausou a mesa' : `${who} pediu uma pausa`}
        </p>
        <p className={styles.pausedNote}>A mesa espera. Ninguém joga até voltar.</p>

        {canResume ? (
          <button className={styles.action} onClick={onResume}>
            Voltar ao jogo
          </button>
        ) : (
          <p className={styles.pausedNote}>Só {who} ou o líder podem retomar.</p>
        )}
      </motion.div>
    </div>
  )
}
