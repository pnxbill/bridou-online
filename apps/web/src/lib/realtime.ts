'use client'

import { io } from 'socket.io-client'
import { getServerUrl } from './config'

/**
 * Transport-agnostic realtime channel. The active transport is a build-time
 * flag: NEXT_PUBLIC_REALTIME_TRANSPORT=socketio switches back to sockets;
 * anything else (or unset) uses SSE. Both are always live on the server.
 */
export interface RealtimeHandlers {
  /** (name, payload) pairs: 'event' carries DomainEvents; queue pages also get 'player-entered-queue' / 'game-started'. */
  onEvent: (name: string, payload: unknown) => void
  /** Fired when the connection drops and comes back — refetch snapshots here. */
  onReconnect?: () => void
}

export interface RealtimeChannel {
  close(): void
}

const TRANSPORT: 'socketio' | 'sse' =
  process.env.NEXT_PUBLIC_REALTIME_TRANSPORT === 'socketio' ? 'socketio' : 'sse'

export const openChannel = (
  gameId: string,
  playerId: string,
  handlers: RealtimeHandlers,
): RealtimeChannel =>
  TRANSPORT === 'socketio'
    ? openSocketChannel(gameId, playerId, handlers)
    : openSseChannel(gameId, playerId, handlers)

const openSseChannel = (
  gameId: string,
  playerId: string,
  handlers: RealtimeHandlers,
): RealtimeChannel => {
  const url = `${getServerUrl()}/api/games/${encodeURIComponent(gameId)}/events?playerId=${encodeURIComponent(playerId)}`
  const source = new EventSource(url)
  let dropped = false

  source.onopen = () => {
    if (dropped) {
      dropped = false
      handlers.onReconnect?.()
    }
  }
  // EventSource retries by itself; we only note the drop to detect the comeback
  source.onerror = () => {
    dropped = true
  }
  source.onmessage = (message) => {
    const { name, payload } = JSON.parse(message.data) as { name: string; payload?: unknown }
    handlers.onEvent(name, payload)
  }

  return { close: () => source.close() }
}

const openSocketChannel = (
  gameId: string,
  playerId: string,
  handlers: RealtimeHandlers,
): RealtimeChannel => {
  const socket = io(getServerUrl(), { auth: { gameId, playerId } })
  socket.onAny((name: string, payload: unknown) => handlers.onEvent(name, payload))
  socket.io.on('reconnect', () => handlers.onReconnect?.())

  return { close: () => socket.disconnect() }
}
