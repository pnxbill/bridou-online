'use client'

import {
  BASEADO_FREE_TRAGADAS,
  EMOTES_BY_ID,
  achievementById,
  type RoundPlayer,
} from '@bridou/shared'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { playAchievementSound } from '../sounds'
import type { TableToast } from '../reducer'
import styles from './TableToasts.module.css'

interface Props {
  toasts: TableToast[]
  players: RoundPlayer[]
  onDismiss: (id: string) => void
}

/** How long each banner holds the screen before the next one gets its turn. */
const ACHIEVEMENT_MS = 3200
const EMOTE_MS = 1800
const CACHIMBO_MS = 2400

/**
 * The social ticker over the table: conquistas and provocações.
 *
 * Only the oldest toast is on screen at a time — the whole point of a live
 * unlock is that everyone reads it, and three stacked banners during a busy
 * round end means nobody reads any of them.
 */
export function TableToasts({ toasts, players, onDismiss }: Props) {
  const current = toasts[0]

  useEffect(() => {
    if (!current) return
    if (current.kind === 'achievement') playAchievementSound()
    const hold =
      current.kind === 'achievement'
        ? ACHIEVEMENT_MS
        : current.kind === 'cachimbo'
          ? CACHIMBO_MS
          : EMOTE_MS
    const timer = setTimeout(() => onDismiss(current.id), hold)
    return () => clearTimeout(timer)
  }, [current, onDismiss])

  if (!current) return null

  const who = players.find((p) => p.id === current.playerId)?.name ?? 'Alguém'

  return (
    <div className={styles.layer} aria-live="polite">
      <AnimatePresence mode="wait">
        {current.kind === 'achievement' ? (
          <AchievementToast key={current.id} name={who} achievementId={current.achievementId} />
        ) : current.kind === 'cachimbo' ? (
          <CachimboToast key={current.id} name={who} tragadas={current.tragadas} />
        ) : (
          <EmoteToast key={current.id} name={who} emoteId={current.emoteId} />
        )}
      </AnimatePresence>
    </div>
  )
}

function AchievementToast({ name, achievementId }: { name: string; achievementId: string }) {
  const def = achievementById(achievementId)
  if (!def) return null

  return (
    <motion.div
      className={styles.achievement}
      data-tier={def.tier}
      data-roast={def.roast ? '' : undefined}
      initial={{ y: -40, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -24, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      <span className={styles.icon} aria-hidden>
        {def.icon}
      </span>
      <span className={styles.body}>
        <span className={styles.who}>{name} desbloqueou</span>
        <strong className={styles.title}>{def.name}</strong>
      </span>
    </motion.div>
  )
}

/**
 * The one piece of etiquette the game enforces out loud. Everything else about
 * the baseado is on the felt and in the dock; this fires once, the tragada it
 * stops paying, because "quem tá segurando" is the table's business.
 */
function CachimboToast({ name, tragadas }: { name: string; tragadas: number }) {
  return (
    <motion.div
      className={styles.emote}
      initial={{ y: 12, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -12, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
    >
      <span className={styles.icon} aria-hidden>
        🪈
      </span>
      <span className={styles.body}>
        <strong className={styles.title}>Virou cachimbo</strong>
        <span className={styles.who}>
          {name} · {tragadas} tragadas, {tragadas - BASEADO_FREE_TRAGADAS} já é prejuízo
        </span>
      </span>
    </motion.div>
  )
}

function EmoteToast({ name, emoteId }: { name: string; emoteId: string }) {
  const def = EMOTES_BY_ID.get(emoteId)
  if (!def) return null

  return (
    <motion.div
      className={styles.emote}
      initial={{ y: 12, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -12, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
    >
      <span className={styles.icon} aria-hidden>
        {def.icon}
      </span>
      <span className={styles.body}>
        <strong className={styles.title}>{def.label}</strong>
        <span className={styles.who}>{name}</span>
      </span>
    </motion.div>
  )
}
