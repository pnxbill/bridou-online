import { MAX_PLAYERS, type LobbySnapshot, type PlayerInfo } from '@bridou/shared'
import { GameError } from '@bridou/engine'
import { randomUUID } from 'node:crypto'

/** Uppercase letters/digits that survive handwriting and voice: no 0/O, 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5

/** Lobbies nobody started within this window are swept away. */
export const LOBBY_TTL_MS = 2 * 60 * 60 * 1000

export const normalizeCode = (code: string): string => code.trim().toUpperCase()

const randomCode = (): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('')

/**
 * A table waiting for its game to start. Its id becomes the game's id, so
 * players already connected to the lobby room are in the game room too;
 * the human-friendly `code` is what players type or receive in invite links.
 */
export class Lobby {
  readonly id: string = randomUUID()
  players: PlayerInfo[] = []
  touchedAt: number

  constructor(
    readonly code: string,
    now: number = Date.now(),
  ) {
    this.touchedAt = now
  }

  /** The first (human) seat leads; leaving hands leadership to the next seat. */
  get leaderId(): string | undefined {
    return this.players[0]?.id
  }

  has(playerId: string): boolean {
    return this.players.some((p) => p.id === playerId)
  }

  add(player: PlayerInfo): void {
    if (this.has(player.id)) throw new GameError('Already at this table')
    if (this.players.length >= MAX_PLAYERS) {
      throw new GameError(`Table is full (max ${MAX_PLAYERS} players)`)
    }
    this.players.push(player)
  }

  /** @returns whether the player was actually seated. */
  remove(playerId: string): boolean {
    const before = this.players.length
    this.players = this.players.filter((p) => p.id !== playerId)
    return this.players.length !== before
  }

  snapshot(): LobbySnapshot {
    return {
      lobbyId: this.id,
      code: this.code,
      leaderId: this.leaderId ?? '',
      players: [...this.players],
    }
  }
}

/**
 * All open lobbies, addressable by code. Codes are unique among open lobbies
 * and recycled after a lobby closes (starts, empties, or goes stale).
 */
export class LobbyRegistry {
  private readonly lobbies = new Map<string, Lobby>()

  constructor(
    private readonly options: {
      now?: () => number
      ttlMs?: number
      generateCode?: () => string
    } = {},
  ) {}

  create(): Lobby {
    this.sweep()
    const generate = this.options.generateCode ?? randomCode
    let code = generate()
    while (this.lobbies.has(code)) code = generate()

    const lobby = new Lobby(code, this.now())
    this.lobbies.set(code, lobby)
    return lobby
  }

  byCode(code: string): Lobby | undefined {
    this.sweep()
    const lobby = this.lobbies.get(normalizeCode(code))
    if (lobby) lobby.touchedAt = this.now()
    return lobby
  }

  delete(code: string): void {
    this.lobbies.delete(normalizeCode(code))
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** Lazy eviction: forgotten lobbies die the next time anyone touches the registry. */
  private sweep(): void {
    const cutoff = this.now() - (this.options.ttlMs ?? LOBBY_TTL_MS)
    for (const [code, lobby] of this.lobbies) {
      if (lobby.touchedAt < cutoff) this.lobbies.delete(code)
    }
  }
}
