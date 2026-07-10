'use client'

import { useMemo } from 'react'
import styles from './Overlays.module.css'

const COLORS = ['#fbbf24', '#fca5a5', '#86efac', '#93c5fd', '#e2e8f0', '#f9a8d4']

/** Tiny deterministic PRNG — same particles on server and client (hydration). */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(() => {
    const rng = mulberry32(7)
    return Array.from({ length: count }, (_, i) => ({
      left: rng() * 100,
      size: 6 + rng() * 7,
      delay: rng() * 2.4,
      duration: 2.4 + rng() * 2,
      spin: 360 + rng() * 720,
      color: COLORS[i % COLORS.length]!,
    }))
  }, [count])

  return (
    <div className={styles.confetti} aria-hidden>
      {pieces.map((piece, i) => (
        <span
          key={i}
          className={styles.piece}
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 0.45,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            ['--spin' as string]: `${piece.spin}deg`,
          }}
        />
      ))}
    </div>
  )
}
