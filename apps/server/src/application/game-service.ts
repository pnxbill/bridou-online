import { Game, GameError, type Scheduler } from '@bridou/engine'
import {
  BASEADO_PASS_COOLDOWN_MS,
  EMOTE_COOLDOWN_MS,
  isEmoteId,
  type GameSnapshot,
  type LobbySnapshot,
  type PlayerInfo,
  type PlayerPerspective,
  type SessionState,
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
  /** Set while the table paused itself on purpose (not an abandonment). */
  pausedBy: string | null
}

export class GameService {
  /** `${gameId}:${playerId}` → last emote time, for the cooldown. */
  private readonly lastEmoteAt = new Map<string, number>()
  /** gameId → last baseado pass, so two seats can't ping-pong it at wire speed. */
  private readonly lastPassAt = new Map<string, number>()
  /** gameId → the player who paused it. Absent means running. */
  private readonly pausedBy = new Map<string, string>()

  constructor(
    private readonly games: GameRepository,
    private readonly lobbies: LobbyRegistry,
    private readonly gateway: RealtimeGateway,
    /** Seat control: pause enforcement + abandoned/bot state for snapshots. */
    private readonly sessions: GameSessionMonitor,
    private readonly options: {
      scheduler?: Scheduler
      /** Fired after the Game is saved, before `game.start()` emits events. */
      onGameStarted?: (game: Game, context: { mesaId: string | null }) => void
      /** Injectable clock (emote cooldown, snapshot timestamps). */
      now?: () => number
    } = {},
  ) {}

  /**
   * Opens a new table with the creator in the leader seat. `mesaId` ties the
   * table to a persistent mesa so the result lands in its season standings.
   */
  createLobby(player: PlayerInfo, mesaId: string | null = null): LobbySnapshot {
    const lobby = this.lobbies.create(mesaId)
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

    this.options.onGameStarted?.(game, { mesaId: lobby.mesaId })
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
      pausedBy: this.pausedByOf(gameId),
      time: Date.now(),
    }
  }

  placeBet(gameId: string, playerId: string, bet: number): void {
    const game = this.getGame(gameId)
    this.assertNotPaused(gameId)
    this.sessions.assertPlayable(gameId)
    game.placeBet(playerId, bet)
  }

  playCard(gameId: string, playerId: string, card: string): void {
    const game = this.getGame(gameId)
    this.assertNotPaused(gameId)
    this.sessions.assertPlayable(gameId)
    game.playCard(playerId, card)
  }

  /**
   * Passes the baseado to the next seat.
   *
   * Not turn-bound: a blunt doesn't wait for your turn, and the whole point of
   * the mechanic is deciding *when* to let go of it. The engine owns who may
   * pass (only its holder) and where it goes; this layer only adds the two
   * things the engine has no business knowing about — that a paused table
   * isn't playing, and that a clock exists, so two seats can't ping-pong it as
   * fast as the network allows.
   */
  passBaseado(gameId: string, playerId: string): void {
    const game = this.getGame(gameId)
    if (!game.hasPlayer(playerId)) throw new ForbiddenError("You're not in this game")
    this.assertNotPaused(gameId)
    this.sessions.assertPlayable(gameId)

    const now = this.now()
    const last = this.lastPassAt.get(gameId)
    if (last !== undefined && now - last < BASEADO_PASS_COOLDOWN_MS) {
      throw new GameError('Calma, deixa queimar')
    }
    game.passBaseado(playerId)
    this.lastPassAt.set(gameId, now)
  }

  /**
   * Pauses the table on purpose — someone's kid woke up, the pizza arrived.
   *
   * Distinct from the abandonment pause, which is involuntary and runs on a
   * deadline: this one has no timer and only ends when a human ends it. The
   * #1 killer of a 40-minute session is not having this.
   *
   * Any seated player may pause (the person who has to leave is rarely the
   * leader), but only the leader or whoever paused can resume, so nobody can
   * drag the table back before they're ready.
   */
  pauseGame(gameId: string, playerId: string): void {
    const game = this.getGame(gameId)
    if (!game.hasPlayer(playerId)) throw new ForbiddenError("You're not in this game")
    if (game.finished) throw new GameError('A partida já acabou')
    if (this.pausedBy.has(gameId)) return

    this.pausedBy.set(gameId, playerId)
    this.gateway.publisherFor(gameId).publish({ type: 'game-paused', byPlayerId: playerId })
  }

  resumeGame(gameId: string, playerId: string): void {
    const game = this.getGame(gameId)
    if (!game.hasPlayer(playerId)) throw new ForbiddenError("You're not in this game")

    const pausedBy = this.pausedBy.get(gameId)
    if (pausedBy === undefined) return
    if (pausedBy !== playerId && game.leaderId !== playerId) {
      throw new ForbiddenError('Só quem pausou (ou o líder) pode voltar')
    }

    this.pausedBy.delete(gameId)
    this.gateway.publisherFor(gameId).publish({ type: 'game-resumed', byPlayerId: playerId })
  }

  /** Who paused this game, if anyone — included in the reconnect snapshot. */
  pausedByOf(gameId: string): string | null {
    return this.pausedBy.get(gameId) ?? null
  }

  private assertNotPaused(gameId: string): void {
    if (this.pausedBy.has(gameId)) throw new GameError('A partida está pausada')
  }

  closeScoreboard(gameId: string): void {
    this.getGame(gameId).closeScoreboard()
  }

  /**
   * Fires a provocação at the table.
   *
   * Trash talk is most of the point of a card game between friends, and voice
   * only covers the players who turned it on. The set is fixed (no free text)
   * so it's fast to fire mid-trick and impossible to abuse, and the cooldown is
   * enforced here rather than in the client so nobody can spam the table.
   */
  sendEmote(gameId: string, playerId: string, emoteId: string): void {
    if (!isEmoteId(emoteId)) throw new GameError('Provocação desconhecida')

    const game = this.getGame(gameId)
    if (!game.hasPlayer(playerId)) throw new ForbiddenError("You're not in this game")

    const key = `${gameId}:${playerId}`
    const now = this.now()
    const last = this.lastEmoteAt.get(key) ?? 0
    if (now - last < EMOTE_COOLDOWN_MS) throw new GameError('Calma aí')
    this.lastEmoteAt.set(key, now)

    this.gateway.publisherFor(gameId).publish({ type: 'emote-sent', playerId, emoteId, at: now })
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
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
