'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { ApiError, api } from '@/lib/api'

export default function HomePage() {
  const router = useRouter()
  const { user, loading, signIn } = useAuth()
  const [error, setError] = useState('')
  const [activeGameId, setActiveGameId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setActiveGameId(null)
      return
    }

    let cancelled = false
    api
      .currentGame(user.id)
      .then(({ gameId }) => {
        if (!cancelled) setActiveGameId(gameId)
      })
      .catch(() => {
        if (!cancelled) setActiveGameId(null)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const joinQueue = async () => {
    if (!user) return
    try {
      await api.enterQueue(user)
      router.push('/queue')
    } catch (err) {
      // already queued? just go to the queue
      if (err instanceof ApiError && err.message === 'Already on the queue') {
        router.push('/queue')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Servidor indisponível')
    }
  }

  if (loading) return <p className="hint">Carregando…</p>

  return (
    <div className="home">
      <h1>Bridou Online</h1>
      {user ? (
        <>
          {activeGameId && (
            <button
              className="btn primary"
              onClick={() => router.push(`/game/${activeGameId}`)}
            >
              Voltar ao jogo
            </button>
          )}
          <button className={activeGameId ? 'btn' : 'btn primary'} onClick={joinQueue}>
            Entrar na fila
          </button>
        </>
      ) : (
        <button className="btn primary" onClick={signIn}>
          Entrar com Google
        </button>
      )}
      {error && <p className="hint">{error}</p>}
    </div>
  )
}
