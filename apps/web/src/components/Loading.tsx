import type { CSSProperties } from 'react'
import styles from './Loading.module.css'

/**
 * Every wait in the app, in one place.
 *
 * Two shapes, and which one you reach for is the rule: when the shape of what's
 * coming is known — a list of mesas, the ranking sheet, the conquistas shelf —
 * draw it with `SkeletonRows`/`SkeletonTiles`, so the real content replaces the
 * placeholder without the page jumping. When it isn't (auth restoring, a table
 * being entered), show `Loading`: the deck being cut, the same gesture the
 * table deals with.
 *
 * Both fade in on a 220ms delay. A wait that resolves faster than that shows
 * nothing at all, which is the point — a spinner that flashes reads as jank.
 *
 * Fixture: `/dev/loading`.
 */

const PIPS = [
  { glyph: '♠', red: false },
  { glyph: '♥', red: true },
  { glyph: '♣', red: false },
]

const delay = (index: number, step = 0.09): CSSProperties =>
  ({ '--d': `${index * step}s` }) as CSSProperties

/** The mark on its own — for a button, a chip, anywhere a label won't fit. */
export function ShuffleMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={styles.deck} data-size={size} aria-hidden>
      {PIPS.map((pip, i) => (
        <span
          key={pip.glyph}
          className={`${styles.card} ${pip.red ? styles.cardRed : ''}`}
          // a third of the cycle apart: one card is always in flight
          style={delay(i, 0.5)}
        >
          {pip.glyph}
        </span>
      ))}
    </span>
  )
}

interface LoadingProps {
  /** Say what is being waited on — "Carregando…" says nothing worth reading. */
  label?: string
  /** `block` sits in the page column; `screen` fills a full-bleed route. */
  variant?: 'block' | 'screen'
}

export function Loading({ label = 'Embaralhando…', variant = 'block' }: LoadingProps) {
  return (
    <div className={`${styles.wrap} ${styles[variant]}`} role="status" aria-live="polite">
      <ShuffleMark />
      <span className={styles.label}>{label}</span>
    </div>
  )
}

/** A single placeholder block — for one-off shapes the presets don't cover. */
export function Skeleton({
  width,
  height,
  radius,
  className = '',
}: {
  width?: string
  height?: string
  radius?: string
  className?: string
}) {
  return (
    <span
      className={`${styles.skeleton} ${className}`}
      style={{ width, height, borderRadius: radius, display: 'block' }}
      aria-hidden
    />
  )
}

interface RowsProps {
  count?: number
  /** Leading avatar circle — ranking rows and member lists have one. */
  face?: boolean
  /** Trailing chip — the "3 on" badge, a score, a date. */
  trailing?: boolean
  label?: string
}

/** The list cut every screen in the app is already made from. */
export function SkeletonRows({
  count = 3,
  face = false,
  trailing = false,
  label = 'Carregando…',
}: RowsProps) {
  return (
    <div className={styles.group} role="status" aria-live="polite">
      <span className={styles.srOnly}>{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.row} style={delay(i)} aria-hidden>
          {face && <span className={`${styles.skeleton} ${styles.rowFace}`} />}
          <span className={styles.rowLines}>
            <span
              className={`${styles.skeleton} ${styles.rowTitle}`}
              // uneven widths — a column of identical bars reads as a table
              style={{ width: `${68 - (i % 3) * 13}%` }}
            />
            <span
              className={`${styles.skeleton} ${styles.rowMeta}`}
              style={{ width: `${44 - (i % 2) * 10}%` }}
            />
          </span>
          {trailing && <span className={`${styles.skeleton} ${styles.rowTrailing}`} />}
        </div>
      ))}
    </div>
  )
}

/** The conquistas shelf, before the shelf arrives. */
export function SkeletonTiles({
  count = 6,
  label = 'Carregando…',
}: {
  count?: number
  label?: string
}) {
  return (
    <div className={styles.tiles} role="status" aria-live="polite">
      <span className={styles.srOnly}>{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.tile} style={delay(i, 0.06)} aria-hidden>
          <span className={`${styles.skeleton} ${styles.tileIcon}`} />
          <span className={styles.rowLines}>
            <span
              className={`${styles.skeleton} ${styles.rowTitle}`}
              style={{ width: `${76 - (i % 3) * 12}%` }}
            />
            <span className={`${styles.skeleton} ${styles.rowMeta}`} style={{ width: '52%' }} />
          </span>
        </div>
      ))}
    </div>
  )
}
