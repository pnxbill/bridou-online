import { Game, GameError, type Scheduler } from '@bridou/engine'
import type {
  GameSnapshot,
  LobbySnapshot,
  PlayerInfo,
  PlayerPerspective,
  SessionState,
} from '@bridou/shared'
import { randomUUID } from 'node:crypto'
import { ForbiddenError, NotFoundError } from './errors'
import type { Lobby, LobbyRegistry } from './lobby'
import type { GameRepository, GameSessionMonitor, RealtimeGateway } from './ports'

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
    private readonly lobbies: LobbyRegistry,
    private readonly gateway: RealtimeGateway,
    /** Seat control: pause enforcement + abandoned/bot state for snapshots. */
    private readonly sessions: GameSessionMonitor,
    private readonly options: {
      scheduler?: Scheduler
      /** Fired after the Game is saved, before `game.start()` emits events. */
      onGameStarted?: (game: Game) => void
    } = {},
  ) {}

  /** Opens a new table with the creator in the leader seat. */
  createLobby(player: PlayerInfo): LobbySnapshot {
    const lobby = this.lobbies.create()
    lobby.add(player)
    return lobby.snapshot()
  }

  /** Sit at a table by code. Already seated? Fine — invite links are re-clickable. */
  joinLobby(code: string, player: PlayerInfo): LobbySnapshot {
    const lobby = this.getLobby(code)
    if (!lobby.has(player.id)) {
      lobby.add(player)
      this.gateway.lobbyUpdated(lobby.id, lobby.snapshot())
    }
    return lobby.snapshot()
  }

  /** Stand up. Leadership passes to the next seat; a table of bots (or nobody) closes. */
  leaveLobby(code: string, playerId: string): LobbySnapshot {
    const lobby = this.getLobby(code)
    if (lobby.remove(playerId)) {
      if (lobby.players.every((p) => p.isBot)) {
        this.lobbies.delete(code)
      }
      this.gateway.lobbyUpdated(lobby.id, lobby.snapshot())
    }
    return lobby.snapshot()
  }

  lobbyState(code: string): LobbySnapshot {
    return this.getLobby(code).snapshot()
  }

  /** Seats a bot at the table — it plays from the game's very first move. */
  addBotToLobby(code: string, byPlayerId: string): { bot: PlayerInfo } {
    const lobby = this.getLobby(code)
    this.assertLeader(lobby, byPlayerId)

    const taken = new Set(lobby.players.map((p) => p.name))
    const free = BOT_NAMES.filter((name) => !taken.has(name))
    const name = free.length
      ? free[Math.floor(Math.random() * free.length)]!
      : `Bot ${lobby.players.length + 1}`

    const bot: PlayerInfo = { id: `bot-${randomUUID()}`, name, isBot: true }
    lobby.add(bot)
    this.gateway.lobbyUpdated(lobby.id, lobby.snapshot())
    return { bot }
  }

  startGame(code: string, byPlayerId: string): Game {
    const lobby = this.getLobby(code)
    this.assertLeader(lobby, byPlayerId)
    if (lobby.players.length < 2) throw new GameError('Required at least 2 players')
    if (lobby.players.every((p) => p.isBot)) {
      throw new GameError('At least one human player is required')
    }

    const gameId = lobby.id
    const players = [...lobby.players]
    const game = new Game(
      { id: gameId, leaderId: lobby.leaderId!, players },
      {
        publisher: this.gateway.publisherFor(gameId),
        ...(this.options.scheduler ? { scheduler: this.options.scheduler } : {}),
      },
    )
    this.games.save(game)
    this.lobbies.delete(code)

    // Bot seats must be known before the first prompt fires
    this.sessions.registerBotSeats(
      gameId,
      players.filter((p) => p.isBot).map((p) => p.id),
    )

    this.options.onGameStarted?.(game)
    this.gateway.gameStarted(gameId)
    game.start()
    return game
  }

  /** Active unfinished game for this player, if any (for home-screen reconnect). */
  async currentGame(playerId: string): Promise<{ gameId: string | null }> {
    let game = this.games.findActiveByPlayerId(playerId)
    if (!game && this.games.findActivePlayerGameId) {
      // Not in memory — after a restart it may still be durable.
      const gameId = await this.games.findActivePlayerGameId(playerId)
      if (gameId) game = await this.games.hydrate?.(gameId)
    }
    return { gameId: game && !game.finished ? game.id : null }
  }

  /** Full state for a (re)connecting player: snapshot + what they may do now. */
  async enterGame(gameId: string, playerId: string): Promise<EnterGameResult> {
    await this.games.hydrate?.(gameId) // reload from storage if the server restarted
    const game = this.getGame(gameId)
    if (!game.hasPlayer(playerId)) throw new ForbiddenError("You're not in this game")

    return {
      ...game.snapshot(),
      ...game.clientPerspective(playerId),
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

  private getLobby(code: string): Lobby {
    const lobby = this.lobbies.byCode(code)
    if (!lobby) throw new NotFoundError('Lobby not found')
    return lobby
  }

  private assertLeader(lobby: Lobby, playerId: string): void {
    if (lobby.leaderId !== playerId) throw new ForbiddenError('Only the leader can do that')
  }

  private getGame(gameId: string): Game {
    const game = this.games.get(gameId)
    if (!game) throw new NotFoundError('Game not found')
    return game
  }
}
