'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { SettingsSections } from '@/features/settings/SettingsSections'
import { MedalIcon, NavIcon, PersonIcon } from './NavIcons'
import { CONQUISTAS, NAV_ITEMS } from './navigation'
import styles from './UserMenu.module.css'

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

interface Props {
  /**
   * `tab` — the last slot of the bottom bar, shaped like its neighbours.
   * `pill` — the standalone button on the full-bleed screens, where it has to
   * announce itself as a control with no bar around it.
   */
  variant?: 'tab' | 'pill'
  /**
   * Carry the destinations inside the sheet. True exactly where there is no
   * bottom bar (a live table), so those screens are never a dead end.
   */
  withDestinations?: boolean
}

/**
 * You: your name, your shelf, your preferences, and the way out. Opened from
 * the bar's last slot, or from the floating button at a table.
 *
 * It used to be the whole menu — every destination lived in here behind a cog,
 * which is why nobody found the Mão do Dia. Destinations moved to `AppNav`; the
 * cog left the trigger with them, and what stayed is what a cog is allowed to
 * mean.
 *
 * The panel is a bottom sheet rather than a dropdown: the trigger now sits at
 * the bottom of the screen (a dropdown would open off-screen), and the
 * preferences finally get room to breathe.
 */
export function UserMenu({ variant = 'pill', withDestinations = false }: Props) {
  const { user, loading, signIn, logOut } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Navigating away closes it — the sheet outlives the page otherwise.
  useEffect(() => setOpen(false), [pathname])

  const face = user?.photoURL ? (
    <img className={styles.photo} src={user.photoURL} alt="" />
  ) : user ? (
    initials(user.name)
  ) : (
    <PersonIcon />
  )

  return (
    <div className={variant === 'tab' ? styles.rootTab : styles.rootPill} ref={rootRef}>
      <button
        type="button"
        className={`${variant === 'tab' ? styles.tabTrigger : styles.pillTrigger} ${
          open ? styles.triggerOpen : ''
        }`}
        aria-label={user ? `Menu de ${user.name}` : 'Menu'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.face}>{face}</span>
        {variant === 'tab' && <span className={styles.tabLabel}>Você</span>}
      </button>

      {open && (
        <>
          {/* inside the root, so the outside-pointerdown handler won't catch it */}
          <div className={styles.scrim} aria-hidden onPointerDown={() => setOpen(false)} />
          <div className={styles.sheet} role="dialog" aria-label="Menu">
            <span className={styles.grabber} aria-hidden />

            {user ? (
              <div className={styles.identity}>
                <span className={styles.identityAvatar}>
                  {user.photoURL ? <img src={user.photoURL} alt="" /> : initials(user.name)}
                </span>
                <span className={styles.identityName}>{user.name}</span>
              </div>
            ) : (
              !loading && (
                <button type="button" className={styles.signIn} onClick={signIn}>
                  Entrar com Google
                </button>
              )
            )}

            {/* your shelf — the one destination that belongs to you, not to the bar */}
            <nav className={styles.nav}>
              <Link href={CONQUISTAS.href} className={styles.navLink}>
                <span className={styles.navIcon} aria-hidden>
                  <MedalIcon />
                </span>
                {CONQUISTAS.label}
              </Link>

              {/* no bar on this screen: the sheet is the only way out */}
              {withDestinations &&
                NAV_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} className={styles.navLink}>
                    <span className={styles.navIcon} aria-hidden>
                      <NavIcon name={item.icon} size={18} />
                    </span>
                    {item.label}
                  </Link>
                ))}
            </nav>

            <div className={styles.divider} />

            <SettingsSections />

            {user && (
              <>
                <div className={styles.divider} />
                <button type="button" className={styles.signOut} onClick={logOut}>
                  Sair
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
