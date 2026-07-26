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

const CogIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
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
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.face}>
          {user?.photoURL ? (
            <img className={styles.photo} src={user.photoURL} alt="" />
          ) : user ? (
            initials(user.name)
          ) : (
            <PersonIcon />
          )}
        </span>
        {/* the cog is what makes the avatar read as a control, not a portrait */}
        <span className={styles.cog} aria-hidden>
          <CogIcon />
        </span>
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
