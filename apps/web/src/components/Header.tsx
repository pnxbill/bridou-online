'use client'

import Link from 'next/link'
import { useAuth } from '@/features/auth/AuthProvider'

export function Header() {
  const { user, loading, signIn, logOut } = useAuth()

  return (
    <header className="header">
      <Link href="/" className="logo">
        Bridou
      </Link>
      {user && (
        <nav className="header-nav">
          <Link href="/mesas">Mesas</Link>
          <Link href="/conquistas">Conquistas</Link>
          <Link href="/ranking">Ranking</Link>
        </nav>
      )}
      {!loading &&
        (user ? (
          <div className="header-user">
            {user.photoURL && <img className="avatar" src={user.photoURL} alt="" />}
            <span>{user.name}</span>
            <button className="btn small" onClick={logOut}>
              Sair
            </button>
          </div>
        ) : (
          <button className="btn small" onClick={signIn}>
            Entrar com Google
          </button>
        ))}
    </header>
  )
}
