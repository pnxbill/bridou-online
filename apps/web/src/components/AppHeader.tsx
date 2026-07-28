'use client'

import Link from 'next/link'
import { UserMenu } from './UserMenu'
import styles from './AppHeader.module.css'

interface Props {
  /**
   * `bar` — the fixed glass header (lobby, ranking, dev fixtures).
   * `floating` — just the menu button, for the full-bleed screens (home, the
   * table) where a bar would eat the design.
   */
  variant?: 'bar' | 'floating'
}

/** The app's only chrome: one fixed header, one menu behind the avatar. */
export function AppHeader({ variant = 'bar' }: Props) {
  if (variant === 'floating') {
    return (
      <div className={styles.floating}>
        <UserMenu align="left" />
      </div>
    )
  }

  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.wordmark}>
        BRIDOU
      </Link>
      <UserMenu align="right" />
    </header>
  )
}
