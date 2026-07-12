'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { ApiError, api, type GameEntry } from '@/lib/api'
import { GameClient } from './GameClient'

/**
 * Waits for the Firebase session to restore, fetches the caller's private
 * snapshot with their ID token, then hands off to GameClient. Replaces the
 * old server-side fetch that trusted a `uid` cookie.
 */
export function GamePageClient({ gameId }: { gameId: string }) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [game, setGame] = useState<GameEntry | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/')
      return
    }
    let cancelled = false
    api
      .enterGame(gameId)
      .then(({ game }) => {
        if (!cancelled) setGame(game)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Erro inesperado')
      })
    return () => {
      cancelled = true
    }
  }, [gameId, user, loading, router])

  if (error) return <p className="hint">{error}</p>
  if (!user || !game) return <p className="hint">Entrando na mesa…</p>
  return <GameClient gameId={gameId} playerId={user.id} initialSnapshot={game} />
}
