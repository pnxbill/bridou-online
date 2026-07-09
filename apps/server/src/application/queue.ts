import type { PlayerInfo } from '@bridou/shared'
import { GameError } from '@bridou/engine'
import { randomUUID } from 'node:crypto'

/**
 * The lobby waiting for the next game to start. Its id becomes the game's id,
 * so players already connected to the queue room are in the game room too.
 */
export class Queue {
  id: string = randomUUID()
  players: PlayerInfo[] = []

  get leaderId(): string | undefined {
    return this.players[0]?.id
  }

  add(player: PlayerInfo): void {
    if (this.players.some((p) => p.id === player.id)) {
      throw new GameError('Already on the queue')
    }
    this.players.push(player)
  }

  reset(): void {
    this.players = []
    this.id = randomUUID()
  }
}
