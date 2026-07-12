'use client'

import type { DomainEvent } from '@bridou/shared'
import { useEffect, useRef } from 'react'
import { openChannel } from '@/lib/realtime'

interface Options {
  gameId: string
  onEvent: (event: DomainEvent) => void
  /** Fired after the connection drops and comes back — refetch the snapshot here. */
  onReconnect: () => void
}

/** Subscribes to a game's DomainEvent stream (transport chosen in lib/realtime; identity rides the auth token). */
export function useGameChannel({ gameId, onEvent, onReconnect }: Options) {
  const handlers = useRef({ onEvent, onReconnect })
  handlers.current = { onEvent, onReconnect }

  useEffect(() => {
    if (!gameId) return

    const channel = openChannel(gameId, {
      onEvent: (name, payload) => {
        if (name === 'event') handlers.current.onEvent(payload as DomainEvent)
      },
      onReconnect: () => handlers.current.onReconnect(),
    })

    return () => channel.close()
  }, [gameId])
}
