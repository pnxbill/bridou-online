import { Game, GameError, type Scheduler } from '@bridou/engine'
import type { GameSnapshot, PlayerInfo, PlayerPerspective, SessionState } from '@bridou/shared'
import { randomUUID } from 'node:crypto'
import { ForbiddenError, NotFoundError } from './errors'
import type { GameRepository, GameSessionMonitor, RealtimeGateway } from './ports'
import type { Queue } from './queue'

const BOT_NAMES = [
  'Botelho',
  'Robertinho',
  'Botafogo',
  'Bot Marley',
  'Botina',
  'Beto Bot',
  'Boticário',
  'Roboto',
]

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

  /** Seats a bot in the queue — it plays from the game's very first move. */
  addBotToQueue(): { bot: PlayerInfo } {
    const taken = new Set(this.queue.players.map((p) => p.name))
    const free = BOT_NAMES.filter((name) => !taken.has(name))
    const name = free.length
      ? free[Math.floor(Math.random() * free.length)]!
      : `Bot ${this.queue.players.length + 1}`

    const bot: PlayerInfo = { id: `bot-${randomUUID()}`, name, isBot: true }
    this.queue.add(bot)
    this.gateway.playerJoinedQueue(this.queue.id, bot)
    return { bot }
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
    if (this.queue.players.every((p) => p.isBot)) {
      throw new GameError('At least one human player is required')
    }

    const gameId = this.queue.id
    const players = [...this.queue.players]
    const game = new Game(
      { id: gameId, leaderId: this.queue.leaderId!, players },
      {
        publisher: this.gateway.publisherFor(gameId),
        ...(this.options.scheduler ? { scheduler: this.options.scheduler } : {}),
      },
    )
    this.games.save(game)
    this.queue.reset()

    // Bot seats must be known before the first prompt fires
    this.sessions.registerBotSeats(
      gameId,
      players.filter((p) => p.isBot).map((p) => p.id),
    )

    this.gateway.gameStarted(gameId)
    game.start()
    return game
  }

  /** Active unfinished game for this player, if any (for home-screen reconnect). */
  currentGame(playerId: string): { gameId: string | null } {
    const game = this.games.findActiveByPlayerId(playerId)
    return { gameId: game?.id ?? null }
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
