'use client'

import type { RoundPlayer } from '@bridou/shared'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { playRoundResultSound } from '../sounds'
import { Confetti } from './Confetti'
import styles from './Overlays.module.css'

interface Props {
  result: { round: number; bailadores: RoundPlayer[] }
  /** Local player — sound is personal: clean if you made it, bailou if you didn't. */
  playerId: string
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/**
 * The round's emotional peak. Waits a beat so everyone sees the final trick
 * resolve, then lands loud: BAILOU with the guilty front and center, or a
 * clean-round celebration. Cleared automatically when the next round starts.
 */
export function RoundEndOverlay({ result, playerId }: Props) {
  const [visible, setVisible] = useState(false)
  const iBailou = result.bailadores.some((p) => p.id === playerId)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true)
      playRoundResultSound(iBailou ? 'bailou' : 'clean')
    }, 1600)
    return () => clearTimeout(timer)
  }, [iBailou])

  if (!visible) return null

  const { bailadores, round } = result
  const nobody = bailadores.length === 0

  return (
    <div className={styles.overlay}>
      <Confetti count={nobody ? 80 : 50} />
      <motion.div
        className={styles.panel}
        initial={{ scale: 0.7, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <span className={styles.emoji}>{nobody ? '🎉' : '💃'}</span>
        <h2 className={`${styles.title} ${nobody ? styles.titleClean : styles.titleBailou}`}>
          {nobody ? 'NINGUÉM BAILOU!' : bailadores.length === 1 ? 'BAILOU!' : 'BAILARAM!'}
        </h2>
        <p className={styles.subtitle}>
          {nobody ? `geral cravou a rodada ${round}` : `rodada ${round}`}
        </p>

        {!nobody && (
          <ul className={styles.rows}>
            {bailadores.map((player, i) => (
              <motion.li
                key={player.id}
                className={styles.row}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12 }}
              >
                <span className={`${styles.avatar} ${player.isBot ? styles.avatarBot : ''}`}>
                  {player.isBot ? '🤖' : player.photoURL ? (
                    <img src={player.photoURL} alt="" />
                  ) : (
                    initials(player.name)
                  )}
                </span>
                <span className={styles.rowName}>{player.name}</span>
                <span className={styles.rowDetail}>
                  pediu {player.bet} · fez <b>{player.made}</b>
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  )
}
