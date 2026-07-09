'use client'

import type { DomainEvent } from '@bridou/shared'
import { useEffect, useRef } from 'react'
import { openChannel } from '@/lib/realtime'

interface Options {
  gameId: string
  playerId: string
  onEvent: (event: DomainEvent) => void
  /** Fired after the connection drops and comes back — refetch the snapshot here. */
  onReconnect: () => void
}

/** Subscribes to a game's DomainEvent stream (transport chosen in lib/realtime). */
export function useGameChannel({ gameId, playerId, onEvent, onReconnect }: Options) {
  const handlers = useRef({ onEvent, onReconnect })
  handlers.current = { onEvent, onReconnect }

  useEffect(() => {
    if (!gameId || !playerId) return

    const channel = openChannel(gameId, playerId, {
      onEvent: (name, payload) => {
        if (name === 'event') handlers.current.onEvent(payload as DomainEvent)
      },
      onReconnect: () => handlers.current.onReconnect(),
    })

    return () => channel.close()
  }, [gameId, playerId])
}
