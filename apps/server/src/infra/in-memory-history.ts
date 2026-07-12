import type { DomainEvent, PlayerInfo } from '@bridou/shared'
import type {
  FinishedGameRecord,
  GameHistoryRepository,
  PlayerRepository,
  StoredGameEvent,
} from '../application/ports'

const eventPlayerId = (event: DomainEvent): string | null =>
  'playerId' in event ? event.playerId : null

/** In-memory history for tests and when DATABASE_URL is unset. */
export class InMemoryPlayerRepository implements PlayerRepository {
  readonly byId = new Map<string, PlayerInfo>()

  async upsert(player: PlayerInfo): Promise<void> {
    this.byId.set(player.id, { ...player })
  }
}

export class InMemoryGameHistoryRepository implements GameHistoryRepository {
  readonly games = new Map<
    string,
    {
      leaderId: string
      playerCount: number
      startedAt: Date
      endedAt?: Date
      status: string
      finalScoreboard?: FinishedGameRecord['finalScoreboard']
      players?: FinishedGameRecord['players']
    }
  >()
  readonly events = new Map<string, StoredGameEvent[]>()

  async ensureGameStarted(input: {
    gameId: string
    leaderId: string
    playerCount: number
    startedAt?: Date
  }): Promise<void> {
    if (this.games.has(input.gameId)) return
    this.games.set(input.gameId, {
      leaderId: input.leaderId,
      playerCount: input.playerCount,
      startedAt: input.startedAt ?? new Date(),
      status: 'in_progress',
    })
    this.events.set(input.gameId, [])
  }

  async appendEvent(gameId: string, seq: number, event: DomainEvent): Promise<void> {
    const list = this.events.get(gameId) ?? []
    list.push({
      gameId,
      seq,
      type: event.type,
      playerId: eventPlayerId(event),
      payload: event,
      createdAt: new Date(),
    })
    this.events.set(gameId, list)
  }

  async saveFinishedGame(record: FinishedGameRecord): Promise<void> {
    const existing = this.games.get(record.gameId)
    this.games.set(record.gameId, {
      leaderId: record.leaderId,
      playerCount: record.players.length,
      startedAt: existing?.startedAt ?? record.startedAt,
      endedAt: record.endedAt,
      status: 'finished',
      finalScoreboard: record.finalScoreboard,
      players: record.players,
    })
  }

  async getGameEvents(gameId: string): Promise<StoredGameEvent[]> {
    return [...(this.events.get(gameId) ?? [])]
  }

  async listPlayerGames(playerId: string): Promise<string[]> {
    const ids: string[] = []
    for (const [gameId, game] of this.games) {
      if (game.players?.some((p) => p.playerId === playerId)) ids.push(gameId)
    }
    return ids
  }
}
