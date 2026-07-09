/**
 * A rule violation: wrong turn, illegal card, illegal bet, etc.
 * Messages are shown to players as-is, so keep them human-readable.
 */
export class GameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameError'
  }
}
