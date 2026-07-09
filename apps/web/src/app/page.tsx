'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { ApiError, api } from '@/lib/api'

export default function HomePage() {
  const router = useRouter()
  const { user, loading, signIn } = useAuth()
  const [error, setError] = useState('')

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
        <button className="btn primary" onClick={joinQueue}>
          Entrar na fila
        </button>
      ) : (
        <button className="btn primary" onClick={signIn}>
          Entrar com Google
        </button>
      )}
      {error && <p className="hint">{error}</p>}
    </div>
  )
}
