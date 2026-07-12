'use client'

import { io } from 'socket.io-client'
import { getServerUrl } from './config'
import { getIdToken } from './firebase'

/**
 * Transport-agnostic realtime channel. The active transport is a build-time
 * flag: NEXT_PUBLIC_REALTIME_TRANSPORT=socketio switches back to sockets;
 * anything else (or unset) uses SSE. Both are always live on the server.
 *
 * The channel authenticates with the Firebase ID token (fetched fresh on
 * every connection attempt — tokens expire hourly). Logged-out visitors
 * connect without one and the server treats them as spectators: public
 * events only (lobby roster, game-started), never private ones.
 */
export interface RealtimeHandlers {
  /** (name, payload) pairs: 'event' carries DomainEvents; lobby pages also get 'lobby-updated' / 'game-started'. */
  onEvent: (name: string, payload: unknown) => void
  /** Fired when the connection drops and comes back — refetch snapshots here. */
  onReconnect?: () => void
}

export interface RealtimeChannel {
  close(): void
}

const TRANSPORT: 'socketio' | 'sse' =
  process.env.NEXT_PUBLIC_REALTIME_TRANSPORT === 'socketio' ? 'socketio' : 'sse'

const SSE_RETRY_MS = 2000

export const openChannel = (gameId: string, handlers: RealtimeHandlers): RealtimeChannel =>
  TRANSPORT === 'socketio'
    ? openSocketChannel(gameId, handlers)
    : openSseChannel(gameId, handlers)

/**
 * EventSource can't send headers and its built-in retry would reuse a stale
 * token in the URL, so reconnects are managed here: each attempt rebuilds
 * the source with a freshly minted token.
 */
const openSseChannel = (gameId: string, handlers: RealtimeHandlers): RealtimeChannel => {
  let source: EventSource | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let dropped = false

  const connect = async () => {
    const token = await getIdToken()
    if (closed) return

    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    source = new EventSource(
      `${getServerUrl()}/api/games/${encodeURIComponent(gameId)}/events${query}`,
    )
    source.onopen = () => {
      if (dropped) {
        dropped = false
        handlers.onReconnect?.()
      }
    }
    source.onerror = () => {
      dropped = true
      source?.close()
      retry = setTimeout(() => void connect(), SSE_RETRY_MS)
    }
    source.onmessage = (message) => {
      const { name, payload } = JSON.parse(message.data) as { name: string; payload?: unknown }
      handlers.onEvent(name, payload)
    }
  }

  void connect()

  return {
    close: () => {
      closed = true
      clearTimeout(retry)
      source?.close()
    },
  }
}

const openSocketChannel = (gameId: string, handlers: RealtimeHandlers): RealtimeChannel => {
  const socket = io(getServerUrl(), {
    // Callback form runs on every (re)connection attempt → fresh token each time.
    auth: (cb) => {
      void getIdToken().then((token) => cb(token ? { gameId, token } : { gameId }))
    },
  })
  socket.onAny((name: string, payload: unknown) => handlers.onEvent(name, payload))
  socket.io.on('reconnect', () => handlers.onReconnect?.())

  return { close: () => socket.disconnect() }
}
