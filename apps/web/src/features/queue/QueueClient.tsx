'use client'

import type { PlayerInfo } from '@bridou/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '@/features/auth/AuthProvider'
import { api } from '@/lib/api'
import { SERVER_URL } from '@/lib/config'

export function QueueClient() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [queueId, setQueueId] = useState('')
  const [leaderId, setLeaderId] = useState<string | undefined>()
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .queue()
      .then(({ queueId, leaderId, queue }) => {
        setQueueId(queueId)
        setLeaderId(leaderId)
        setPlayers(queue)
      })
      .catch(() => setError('Servidor indisponível'))
  }, [])

  useEffect(() => {
    if (!queueId || !user) return

    const socket = io(SERVER_URL, { auth: { gameId: queueId, playerId: user.id } })
    socket.on('player-entered-queue', (player: PlayerInfo) => {
      setPlayers((current) =>
        current.some((p) => p.id === player.id) ? current : [...current, player],
      )
    })
    socket.on('game-started', () => router.push(`/game/${queueId}`))

    return () => {
      socket.disconnect()
    }
  }, [queueId, user, router])

  if (loading) return <p className="hint">Carregando…</p>
  if (!user) return <p className="hint">Faça login para entrar na fila.</p>
  if (error) return <p className="hint">{error}</p>

  const canStart = leaderId === user.id && players.length >= 2

  return (
    <div className="queue">
      <h1>Jogadores na fila</h1>
      <ul className="queue-list">
        {players.map((player) => (
          <li key={player.id} className="queue-row">
            {player.photoURL && <img className="avatar" src={player.photoURL} alt="" />}
            <span>{player.name}</span>
          </li>
        ))}
        {!players.length && <li className="hint">Ninguém na fila ainda.</li>}
      </ul>
      {canStart && (
        <button className="btn primary" onClick={() => api.startGame().catch(() => {})}>
          COMEÇAR
        </button>
      )}
    </div>
  )
}
