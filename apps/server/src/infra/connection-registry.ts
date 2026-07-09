/**
 * Tracks which transport connection belongs to which player, so private
 * events (hands, bet prompts) reach only their owner. The engine knows
 * nothing about sockets — this mapping lives entirely in the transport layer.
 */
export class ConnectionRegistry {
  private readonly socketByPlayer = new Map<string, string>()

  bind(playerId: string, socketId: string): void {
    this.socketByPlayer.set(playerId, socketId)
  }

  /** Unbind only if this socket is still the player's current one (they may have reconnected). */
  unbind(playerId: string, socketId: string): void {
    if (this.socketByPlayer.get(playerId) === socketId) {
      this.socketByPlayer.delete(playerId)
    }
  }

  socketOf(playerId: string): string | undefined {
    return this.socketByPlayer.get(playerId)
  }
}
