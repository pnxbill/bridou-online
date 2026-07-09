import type { DomainEvent, EventPublisher, PlayerInfo } from '@bridou/shared'
import type { RealtimeGateway } from '../application/ports'

/**
 * Decorator that tees every published domain event to a server-side observer
 * (the abandonment service uses it to know when a bot seat is prompted).
 */
export class InterceptingGateway implements RealtimeGateway {
  constructor(
    private readonly inner: RealtimeGateway,
    private readonly observe: (gameId: string, event: DomainEvent) => void,
  ) {}

  publisherFor(gameId: string): EventPublisher {
    const publisher = this.inner.publisherFor(gameId)
    return {
      publish: (event) => {
        publisher.publish(event)
        this.observe(gameId, event)
      },
    }
  }

  playerJoinedQueue(queueId: string, player: PlayerInfo): void {
    this.inner.playerJoinedQueue(queueId, player)
  }

  gameStarted(gameId: string): void {
    this.inner.gameStarted(gameId)
  }
}
