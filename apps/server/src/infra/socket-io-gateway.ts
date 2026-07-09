import type { DomainEvent, EventPublisher, PlayerInfo } from '@bridou/shared'
import { isPrivateEvent } from '@bridou/shared'
import type { Server } from 'socket.io'
import type { RealtimeGateway } from '../application/ports'
import type { ConnectionRegistry } from './connection-registry'

/**
 * Translates domain events into the socket event names and payloads the
 * existing Qwik client already understands. When the frontend moves to SSE,
 * this file is what gets replaced — nothing above it changes.
 */
const toLegacyEvent = (event: DomainEvent): { name: string; payload?: unknown } => {
  switch (event.type) {
    case 'round-started':
      return { name: 'round-started', payload: event.round }
    case 'trunfo-set':
      return { name: 'set-trunfo', payload: event.trunfo }
    case 'cards-dealt':
      return { name: 'cards', payload: event.cards }
    case 'bet-requested':
      return { name: 'bet-time', payload: event.availableBets }
    case 'play-requested':
      return { name: 'play-time', payload: event.cards }
    case 'player-bet':
      return { name: 'player-bet', payload: { id: event.playerId, bet: event.bet } }
    case 'card-played':
      return { name: 'player-play', payload: event.playedCards }
    case 'turn-started':
      return { name: 'turn-started', payload: event.turn }
    case 'turn-ended':
      return { name: 'turn-ended', payload: event.turn }
    case 'round-ended':
      return { name: 'round-ended', payload: event.bailadores }
    case 'scoreboard-shown':
    case 'game-ended':
      return { name: 'scoreboard', payload: event.scoreboard }
    case 'scoreboard-hidden':
      return { name: 'close-scoreboard' }
  }
}

export class SocketIoGateway implements RealtimeGateway {
  constructor(
    private readonly io: Server,
    private readonly registry: ConnectionRegistry,
  ) {}

  publisherFor(gameId: string): EventPublisher {
    return {
      publish: (event: DomainEvent) => {
        const { name, payload } = toLegacyEvent(event)

        if (isPrivateEvent(event)) {
          const socketId = this.registry.socketOf(event.playerId)
          if (socketId) this.io.to(socketId).emit(name, payload)
          return
        }
        this.io.to(gameId).emit(name, payload)
      },
    }
  }

  playerJoinedQueue(queueId: string, player: PlayerInfo): void {
    this.io.to(queueId).emit('player-entered-queue', player)
  }

  gameStarted(gameId: string): void {
    this.io.to(gameId).emit('game-started')
  }
}

/** Joins sockets to their game's room and keeps the player→socket map fresh. */
export const registerConnectionHandlers = (io: Server, registry: ConnectionRegistry): void => {
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

    socket.on('disconnect', () => {
      registry.unbind(playerId, socket.id)
    })
  })
}
