'use client'

import type { ScoreboardEntry } from '@bridou/shared'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Confetti } from './Confetti'
import styles from './Overlays.module.css'

interface Props {
  scoreboard: ScoreboardEntry[]
  /** True on game end: crown the champion, confetti, exit to home. */
  final?: boolean
  /** Mid-game only: the leader can dismiss and resume. */
  onClose?: () => void
}

const MEDALS = ['🥇', '🥈', '🥉']

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

export function ScoreboardOverlay({ scoreboard, final = false, onClose }: Props) {
  const router = useRouter()
  const champion = scoreboard[0]

  return (
    <div className={styles.overlay}>
      {final && <Confetti count={90} />}
      <motion.div
        className={styles.panel}
        initial={{ scale: 0.8, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        {final && <span className={styles.emoji}>👑</span>}
        <h2 className={`${styles.title} ${styles.titleClean}`}>
          {final ? 'FIM DE JOGO' : 'PLACAR'}
        </h2>
        <p className={styles.subtitle}>
          {final && champion ? `${champion.name} venceu!` : 'metade do jogo'}
        </p>

        <ul className={styles.rows}>
          {scoreboard.map((entry, i) => (
            <motion.li
              key={entry.id}
              className={`${styles.row} ${final && i === 0 ? styles.rowWinner : ''}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
            >
              <span className={styles.rank}>{MEDALS[i] ?? `${i + 1}º`}</span>
              <span className={`${styles.avatar} ${entry.isBot ? styles.avatarBot : ''}`}>
                {entry.isBot ? '🤖' : entry.photoURL ? (
                  <img src={entry.photoURL} alt="" />
                ) : (
                  initials(entry.name)
                )}
              </span>
              <span className={styles.rowName}>{entry.name}</span>
              <span className={styles.points}>{entry.totalPoints}</span>
            </motion.li>
          ))}
        </ul>

        {final ? (
          <button className={styles.action} onClick={() => router.push('/')}>
            Voltar ao início
          </button>
        ) : (
          onClose && (
            <button className={styles.action} onClick={onClose}>
              Continuar
            </button>
          )
        )}
      </motion.div>
    </div>
  )
}
