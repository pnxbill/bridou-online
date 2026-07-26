'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { SettingsSections } from '@/features/settings/SettingsSections'
import styles from './UserMenu.module.css'

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

const PersonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M4.5 20a7.5 7.5 0 0 1 15 0"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
)

/**
 * The one menu in the app: who you are, where you can go, and every
 * preference — behind the avatar. Opened from the header (bar) or from the
 * floating button on the full-bleed screens, so settings stay one tap away
 * mid-game without a second control fighting for the corner.
 */
export function UserMenu({ align = 'right' }: { align?: 'left' | 'right' }) {
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

  // Navigating away closes it — the panel outlives the page otherwise.
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-label={user ? `Menu de ${user.name}` : 'Menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user?.photoURL ? (
          <img className={styles.photo} src={user.photoURL} alt="" />
        ) : user ? (
          <span className={styles.initials}>{initials(user.name)}</span>
        ) : (
          <PersonIcon />
        )}
      </button>

      {open && (
        <div
          className={`${styles.panel} ${align === 'left' ? styles.panelLeft : styles.panelRight}`}
          role="dialog"
          aria-label="Menu"
        >
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

          <nav className={styles.nav}>
            {pathname !== '/' && (
              <Link href="/" className={styles.navLink}>
                Início
              </Link>
            )}
            {pathname !== '/ranking' && (
              <Link href="/ranking" className={styles.navLink}>
                Ranking
              </Link>
            )}
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
      )}
    </div>
  )
}
