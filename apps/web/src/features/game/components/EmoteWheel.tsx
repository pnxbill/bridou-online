'use client'

import { EMOTES, EMOTE_COOLDOWN_MS } from '@bridou/shared'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { playEmoteSound } from '../sounds'
import styles from './EmoteWheel.module.css'

interface Props {
  onSend: (emoteId: string) => void
}

/**
 * Provocações — a tap to open, a tap to fire.
 *
 * Deliberately small and out of the thumb's way: the hand and the bet bar own
 * the bottom of the screen, and a reaction that costs you a misplayed card
 * isn't worth having. The cooldown is mirrored here purely so the button can
 * look disabled; the server is the one that enforces it.
 */
export function EmoteWheel({ onSend }: Props) {
  const [open, setOpen] = useState(false)
  const [cooling, setCooling] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Tapping the felt closes the wheel — it should never sit there eating taps.
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const send = (emoteId: string) => {
    if (cooling) return
    setCooling(true)
    setOpen(false)
    playEmoteSound()
    onSend(emoteId)
    setTimeout(() => setCooling(false), EMOTE_COOLDOWN_MS)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <AnimatePresence>
        {open && (
          <motion.ul
            className={styles.wheel}
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ type: 'spring', stiffness: 460, damping: 28 }}
          >
            {EMOTES.map((emote) => (
              <li key={emote.id}>
                <button
                  type="button"
                  className={styles.emote}
                  onClick={() => send(emote.id)}
                  aria-label={emote.label}
                  title={emote.label}
                >
                  {emote.icon}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <button
        type="button"
        className={styles.toggle}
        data-cooling={cooling ? '' : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Provocações"
      >
        {open ? '✕' : '😏'}
      </button>
    </div>
  )
}
