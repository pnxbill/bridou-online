'use client'

import { useState } from 'react'
import styles from './PauseButton.module.css'

interface Props {
  onPause: () => void
}

/**
 * Pausar a mesa.
 *
 * Two taps, because a stray tap that freezes everyone else's game is worse
 * than one extra tap for the person who genuinely has to go. Sits above the
 * provocação wheel on the same left rim.
 */
export function PauseButton({ onPause }: Props) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className={styles.confirm}>
        <button
          type="button"
          className={styles.confirmYes}
          onClick={() => {
            setConfirming(false)
            onPause()
          }}
        >
          Pausar mesa
        </button>
        <button type="button" className={styles.confirmNo} onClick={() => setConfirming(false)}>
          deixa
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => setConfirming(true)}
      aria-label="Pausar a mesa"
      title="Pausar a mesa"
    >
      ⏸
    </button>
  )
}
