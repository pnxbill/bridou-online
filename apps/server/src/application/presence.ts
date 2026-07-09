export interface PresenceListener {
  playerOnline(gameId: string, playerId: string): void
  playerOffline(gameId: string, playerId: string): void
}

/**
 * Counts live connections per (game, player) across ALL transports — a
 * player is offline only when their last connection (socket or SSE) is gone.
 * Fires the listener on the 0↔1 transitions.
 */
export class PresenceTracker {
  private readonly connections = new Map<string, { gameId: string; playerId: string }>()
  private readonly counts = new Map<string, number>()

  constructor(private readonly listener: PresenceListener) {}

  connected(gameId: string, playerId: string, connectionId: string): void {
    if (this.connections.has(connectionId)) return
    this.connections.set(connectionId, { gameId, playerId })

    const key = `${gameId}:${playerId}`
    const count = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, count)
    if (count === 1) this.listener.playerOnline(gameId, playerId)
  }

  disconnected(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return
    this.connections.delete(connectionId)

    const key = `${connection.gameId}:${connection.playerId}`
    const count = (this.counts.get(key) ?? 1) - 1
    if (count > 0) {
      this.counts.set(key, count)
      return
    }
    this.counts.delete(key)
    this.listener.playerOffline(connection.gameId, connection.playerId)
  }

  isOnline(gameId: string, playerId: string): boolean {
    return (this.counts.get(`${gameId}:${playerId}`) ?? 0) > 0
  }
}
