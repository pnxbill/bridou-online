import type { DomainEvent, EventPublisher, LobbySnapshot } from '@bridou/shared'
import { isPrivateEvent } from '@bridou/shared'
import type { Server } from 'socket.io'
import type { RealtimeGateway, TokenVerifier } from '../application/ports'
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

/**
 * Joins sockets to their game's room and keeps the player→socket map fresh.
 * Identity comes from the verified handshake token, mirroring the SSE
 * endpoint: no token is a spectator (public room events only, no registry
 * bind, no presence), a bad token is rejected.
 */
export const registerConnectionHandlers = (
  io: Server,
  registry: ConnectionRegistry,
  presence: PresenceTracker | undefined,
  verifier: TokenVerifier,
): void => {
  io.use((socket, next) => {
    const { token } = socket.handshake.auth as { token?: string }
    if (!token) return next()
    verifier
      .verify(token)
      .then((player) => {
        if (!player) return next(new Error('Unauthorized'))
        socket.data.playerId = player.id
        next()
      })
      .catch(next)
  })

  io.on('connection', (socket) => {
    const { gameId } = socket.handshake.auth as { gameId?: string }
    if (!gameId) {
      socket.disconnect(true)
      return
    }

    socket.join(gameId)
    const playerId = socket.data.playerId as string | undefined
    if (!playerId) return // spectator

    registry.bind(playerId, socket.id)
    presence?.connected(gameId, playerId, socket.id)

    socket.on('disconnect', () => {
      registry.unbind(playerId, socket.id)
      presence?.disconnected(socket.id)
    })
  })
}
