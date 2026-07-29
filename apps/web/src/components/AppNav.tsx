'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavIcon } from './NavIcons'
import { UserMenu } from './UserMenu'
import { NAV_ITEMS, isActiveTab } from './navigation'
import styles from './AppNav.module.css'

/**
 * The app's navigation: a fixed bar on the bottom rim, where a thumb already
 * is. Four destinations plus you.
 *
 * It replaces a menu that hid every destination behind a settings cog — so the
 * rule now is that going somewhere is *visible* and where you are is *legible*
 * (the lit tab), while the sheet behind your face keeps only what a cog may
 * mean: who you are and your preferences.
 *
 * Not rendered on a live table (`/game/[gameId]`, `/diaria`): there the hand and
 * the `TableDock` own the bottom edge, and those screens keep the floating menu
 * button — whose sheet carries these same destinations so they're never a dead
 * end.
 */
export function AppNav() {
  const pathname = usePathname()

  return (
    <nav className={styles.bar} aria-label="Navegação principal">
      {NAV_ITEMS.map((item) => {
        const active = isActiveTab(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <NavIcon name={item.icon} />
            <span className={styles.label}>{item.label}</span>
          </Link>
        )
      })}
      <UserMenu variant="tab" />
    </nav>
  )
}
