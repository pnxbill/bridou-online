'use client'

import type { DomainEvent } from '@bridou/shared'
import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { SERVER_URL } from '@/lib/config'

interface Options {
  gameId: string
  playerId: string
  onEvent: (event: DomainEvent) => void
  /** Fired after the connection drops and comes back — refetch the snapshot here. */
  onReconnect: () => void
}

/**
 * The realtime channel for a game. This is the ONLY file that knows the
 * transport is socket.io — the SSE migration swaps its internals
 * (EventSource + auto-retry) without touching the reducer or the UI.
 */
export function useGameChannel({ gameId, playerId, onEvent, onReconnect }: Options) {
  const handlers = useRef({ onEvent, onReconnect })
  handlers.current = { onEvent, onReconnect }

  useEffect(() => {
    if (!gameId || !playerId) return

    const socket = io(SERVER_URL, { auth: { gameId, playerId } })
    socket.on('event', (event: DomainEvent) => handlers.current.onEvent(event))
    socket.io.on('reconnect', () => handlers.current.onReconnect())

    return () => {
      socket.disconnect()
    }
  }, [gameId, playerId])
}
