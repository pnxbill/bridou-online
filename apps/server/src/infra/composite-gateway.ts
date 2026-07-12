import type { EventPublisher, LobbySnapshot } from '@bridou/shared'
import type { RealtimeGateway } from '../application/ports'

/**
 * Publishes to several transports at once (socket.io + SSE) so clients can
 * pick theirs with a flag. Drop this for a single gateway once one transport
 * wins.
 */
export class CompositeGateway implements RealtimeGateway {
  constructor(private readonly gateways: RealtimeGateway[]) {}

  publisherFor(gameId: string): EventPublisher {
    const publishers = this.gateways.map((g) => g.publisherFor(gameId))
    return {
      publish: (event) => publishers.forEach((p) => p.publish(event)),
    }
  }

  lobbyUpdated(lobbyId: string, lobby: LobbySnapshot): void {
    this.gateways.forEach((g) => g.lobbyUpdated(lobbyId, lobby))
  }

  gameStarted(gameId: string): void {
    this.gateways.forEach((g) => g.gameStarted(gameId))
  }
}
