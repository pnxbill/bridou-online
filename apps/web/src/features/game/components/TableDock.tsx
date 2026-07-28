'use client'

import type { ReactNode } from 'react'
import styles from './TableDock.module.css'

/**
 * The bottom-left rim of the table — the one place in-game controls may live.
 *
 * Everything here used to pin itself to the corner independently (voice at
 * 12px, the provocação wheel at 88px, pause at 136px), which quietly broke as
 * soon as the voice roster grew tall enough to reach them. One owner of the
 * corner, stacked bottom-up, means the offsets can't drift apart again.
 *
 * This is the in-game counterpart to the rule for the app chrome: the header's
 * menu owns the top-left, this owns the bottom-left, and nothing else pins
 * itself anywhere.
 */
export function TableDock({ children }: { children: ReactNode }) {
  return <div className={styles.dock}>{children}</div>
}
