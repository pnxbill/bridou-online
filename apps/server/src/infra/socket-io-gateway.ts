import type { DomainEvent, EventPublisher, LobbySnapshot } from '@bridou/shared'
import { isPrivateEvent } from '@bridou/shared'
import type { Server } from 'socket.io'
import type { RealtimeGateway } from '../application/ports'
import type { PresenceTracker } from '../application/presence'
import type { ConnectionRegistry } from './connection-registry'

/**
 * Delivers domain events over socket.io: broadcasts to the game room, private
 * events (hands, prompts) only to their owner's socket. When the transport
 * moves to SSE, this gateway is the only thing that gets replaced.
 */
export class SocketIoGateway implements RealtimeGateway {
  constructor(
    private readonly io: Server,
    private readonly registry: ConnectionRegistry,
  ) {}

  publisherFor(gameId: string): EventPublisher {
    return {
      publish: (event: DomainEvent) => {
        if (isPrivateEvent(event)) {
          const socketId = this.registry.socketOf(event.playerId)
          if (socketId) this.io.to(socketId).emit('event', event)
          return
        }
        this.io.to(gameId).emit('event', event)
      },
    }
  }

  lobbyUpdated(lobbyId: string, lobby: LobbySnapshot): void {
    this.io.to(lobbyId).emit('lobby-updated', lobby)
  }

  gameStarted(gameId: string): void {
    this.io.to(gameId).emit('game-started')
  }
}

/** Joins sockets to their game's room and keeps the player→socket map fresh. */
export const registerConnectionHandlers = (
  io: Server,
  registry: ConnectionRegistry,
  presence?: PresenceTracker,
): void => {
  io.on('connection', (socket) => {
    const { gameId, playerId } = socket.handshake.auth as {
      gameId?: string
      playerId?: string
    }
    if (!gameId || !playerId) {
      socket.disconnect(true)
      return
    }

    socket.join(gameId)
    registry.bind(playerId, socket.id)
    presence?.connected(gameId, playerId, socket.id)

    socket.on('disconnect', () => {
      registry.unbind(playerId, socket.id)
      presence?.disconnected(socket.id)
    })
  })
}
