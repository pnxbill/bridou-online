'use client'

import type { PlayerInfo } from '@bridou/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { api } from '@/lib/api'
import { openChannel } from '@/lib/realtime'

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

    const channel = openChannel(queueId, user.id, {
      onEvent: (name, payload) => {
        if (name === 'player-entered-queue') {
          const player = payload as PlayerInfo
          setPlayers((current) =>
            current.some((p) => p.id === player.id) ? current : [...current, player],
          )
        }
        if (name === 'game-started') router.push(`/game/${queueId}`)
      },
    })

    return () => channel.close()
  }, [queueId, user, router])

  if (loading) return <p className="hint">Carregando…</p>
  if (!user) return <p className="hint">Faça login para entrar na fila.</p>
  if (error) return <p className="hint">{error}</p>

  const isLeader = leaderId === user.id
  const canStart = isLeader && players.length >= 2

  const addBot = async () => {
    try {
      await api.addBot()
      // the player-entered-queue event updates the list for everyone, us included
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar o bot')
    }
  }

  return (
    <div className="queue">
      <h1>Jogadores na fila</h1>
      <ul className="queue-list">
        {players.map((player) => (
          <li key={player.id} className="queue-row">
            {player.isBot ? (
              <span className="avatar bot-avatar" title="Bot">
                🤖
              </span>
            ) : (
              player.photoURL && <img className="avatar" src={player.photoURL} alt="" />
            )}
            <span>
              {player.name}
              {player.isBot && <span className="bot-tag"> · bot</span>}
            </span>
          </li>
        ))}
        {!players.length && <li className="hint">Ninguém na fila ainda.</li>}
      </ul>
      {isLeader && (
        <div className="queue-actions">
          <button className="btn" onClick={addBot}>
            Adicionar bot 🤖
          </button>
          {canStart && (
            <button className="btn primary" onClick={() => api.startGame().catch(() => {})}>
              COMEÇAR
            </button>
          )}
        </div>
      )}
    </div>
  )
}
