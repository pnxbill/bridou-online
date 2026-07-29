'use client'

import Link from 'next/link'
import { UserMenu } from './UserMenu'
import styles from './AppHeader.module.css'

interface Props {
  /**
   * `bar` — the fixed glass header (lobby, ranking, dev fixtures). Just the
   * wordmark now: you and the destinations live on the bottom bar, within
   * reach. It stays because it's what absorbs the status-bar inset when the
   * PWA runs standalone.
   * `floating` — the menu button alone, for the full-bleed play surfaces (the
   * table, the Mão do Dia) where neither bar can exist. Its sheet carries the
   * destinations, since there's no bar to carry them.
   */
  variant?: 'bar' | 'floating'
}

/** The app's chrome: this header, the bottom bar (`AppNav`), one sheet. */
export function AppHeader({ variant = 'bar' }: Props) {
  if (variant === 'floating') {
    return (
      <div className={styles.floating}>
        <UserMenu variant="pill" withDestinations />
      </div>
    )
  }

  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.wordmark}>
        BRIDOU
      </Link>
    </header>
  )
}
