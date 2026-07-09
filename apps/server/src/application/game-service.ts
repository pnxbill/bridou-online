import { Game, GameError, type Scheduler } from '@bridou/engine'
import type { GameSnapshot, PlayerInfo, PlayerPerspective, SessionState } from '@bridou/shared'
import { ForbiddenError, NotFoundError } from './errors'
import type { GameRepository, GameSessionMonitor, RealtimeGateway } from './ports'
import type { Queue } from './queue'

export interface EnterGameResult extends GameSnapshot, PlayerPerspective, SessionState {
  time: number
}

export class GameService {
  constructor(
    private readonly games: GameRepository,
    private readonly queue: Queue,
    private readonly gateway: RealtimeGateway,
    /** Seat control: pause enforcement + abandoned/bot state for snapshots. */
    private readonly sessions: GameSessionMonitor,
    private readonly options: { scheduler?: Scheduler } = {},
  ) {}

  joinQueue(player: PlayerInfo): { queueId: string; leaderId: string } {
    this.queue.add(player)
    this.gateway.playerJoinedQueue(this.queue.id, player)
    return { queueId: this.queue.id, leaderId: this.queue.leaderId! }
  }

  queueState(): { queueId: string; leaderId?: string; queue: PlayerInfo[] } {
    return {
      queueId: this.queue.id,
      leaderId: this.queue.leaderId,
      queue: [...this.queue.players],
    }
  }

  startGame(): Game {
    if (this.queue.players.length < 2) throw new GameError('Required at least 2 players')

    const gameId = this.queue.id
    const game = new Game(
      { id: gameId, leaderId: this.queue.leaderId!, players: [...this.queue.players] },
      {
        publisher: this.gateway.publisherFor(gameId),
        ...(this.options.scheduler ? { scheduler: this.options.scheduler } : {}),
      },
    )
    this.games.save(game)
    this.queue.reset()

    this.gateway.gameStarted(gameId)
    game.start()
    return game
  }

  /** Full state for a (re)connecting player: snapshot + what they may do now. */
  enterGame(gameId: string, playerId: string): EnterGameResult {
    const game = this.getGame(gameId)
    if (!game.hasPlayer(playerId)) throw new ForbiddenError("You're not in this game")

    return {
      ...game.snapshot(),
      ...game.perspective(playerId),
      ...this.sessions.sessionState(gameId),
      time: Date.now(),
    }
  }

  placeBet(gameId: string, playerId: string, bet: number): void {
    const game = this.getGame(gameId)
    this.sessions.assertPlayable(gameId)
    game.placeBet(playerId, bet)
  }

  playCard(gameId: string, playerId: string, card: string): void {
    const game = this.getGame(gameId)
    this.sessions.assertPlayable(gameId)
    game.playCard(playerId, card)
  }

  closeScoreboard(gameId: string): void {
    this.getGame(gameId).closeScoreboard()
  }

  private getGame(gameId: string): Game {
    const game = this.games.get(gameId)
    if (!game) throw new NotFoundError('Game not found')
    return game
  }
}
