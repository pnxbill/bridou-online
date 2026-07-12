import type { DomainEvent, EventPublisher, LobbySnapshot } from '@bridou/shared'
import { isPrivateEvent } from '@bridou/shared'
import type { Request, Response } from 'express'
import type { RealtimeGateway } from '../application/ports'
import type { PresenceTracker } from '../application/presence'

/**
 * Every SSE message carries this envelope, mirroring socket.io's
 * (eventName, payload) pair so the client abstraction is transport-agnostic.
 */
interface Envelope {
  name: string
  payload?: unknown
}

interface SseConnection {
  playerId: string
  res: Response
}

const HEARTBEAT_INTERVAL_MS = 20_000

/**
 * Server-Sent Events transport. Clients subscribe to
 * `GET /api/games/:gameId/events?playerId=…`; the browser's EventSource
 * reconnects automatically, and the client refetches the game snapshot on
 * reconnect, so no event replay is needed (ids are sent anyway).
 */
export class SseGateway implements RealtimeGateway {
  private readonly rooms = new Map<string, Set<SseConnection>>()
  private readonly heartbeat: NodeJS.Timeout
  private nextEventId = 1
  private nextConnectionId = 1

  constructor(private readonly presence?: PresenceTracker) {
    // Periodic comment keeps proxies from killing idle connections and lets
    // the OS surface dead sockets.
    this.heartbeat = setInterval(() => {
      for (const room of this.rooms.values()) {
        for (const conn of room) conn.res.write(': heartbeat\n\n')
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  /** Express handler for the event-stream endpoint. */
  handler() {
    return (req: Request, res: Response): void => {
      const gameId = req.params.gameId
      const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : ''
      if (!gameId || !playerId) {
        res.status(400).json({ message: 'Missing gameId or playerId' })
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.write('retry: 2000\n\n')

      const connection: SseConnection = { playerId, res }
      const room = this.rooms.get(gameId) ?? new Set()
      room.add(connection)
      this.rooms.set(gameId, room)
      const connectionId = `sse-${this.nextConnectionId++}`
      this.presence?.connected(gameId, playerId, connectionId)

      res.on('close', () => {
        room.delete(connection)
        if (!room.size) this.rooms.delete(gameId)
        this.presence?.disconnected(connectionId)
      })
    }
  }

  publisherFor(gameId: string): EventPublisher {
    return {
      publish: (event: DomainEvent) => {
        const envelope: Envelope = { name: 'event', payload: event }
        if (isPrivateEvent(event)) {
          this.send(gameId, envelope, (conn) => conn.playerId === event.playerId)
          return
        }
        this.send(gameId, envelope)
      },
    }
  }

  lobbyUpdated(lobbyId: string, lobby: LobbySnapshot): void {
    this.send(lobbyId, { name: 'lobby-updated', payload: lobby })
  }

  gameStarted(gameId: string): void {
    this.send(gameId, { name: 'game-started' })
  }

  close(): void {
    clearInterval(this.heartbeat)
    for (const room of this.rooms.values()) {
      for (const conn of room) conn.res.end()
    }
    this.rooms.clear()
  }

  private send(gameId: string, envelope: Envelope, only?: (conn: SseConnection) => boolean): void {
    const room = this.rooms.get(gameId)
    if (!room) return

    const frame = `id: ${this.nextEventId++}\ndata: ${JSON.stringify(envelope)}\n\n`
    for (const conn of room) {
      if (only && !only(conn)) continue
      conn.res.write(frame)
    }
  }
}
