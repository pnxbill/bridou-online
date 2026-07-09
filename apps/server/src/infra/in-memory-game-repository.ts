import type { Game } from '@bridou/engine'
import type { GameRepository } from '../application/ports'

export class InMemoryGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>()

  get(gameId: string): Game | undefined {
    return this.games.get(gameId)
  }

  save(game: Game): void {
    this.games.set(game.id, game)
  }

  delete(gameId: string): void {
    this.games.delete(gameId)
  }
}
