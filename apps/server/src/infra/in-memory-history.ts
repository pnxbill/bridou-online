import type { DomainEvent, PlayerInfo, RankingEntry } from '@bridou/shared'
import type {
  FinishedGameRecord,
  GameHistoryRepository,
  PlayerRepository,
  StoredGameEvent,
} from '../application/ports'
import { toRanking, type RankingAggregate } from '../application/ranking'

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
      ranked?: boolean
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
      ranked: record.ranked,
    })
  }

  async getLeaderboard(): Promise<RankingEntry[]> {
    const byPlayer = new Map<string, RankingAggregate>()
    for (const game of this.games.values()) {
      if (game.status !== 'finished' || !game.ranked || !game.players) continue
      for (const p of game.players) {
        if (p.isBot) continue
        const info = game.finalScoreboard?.find((s) => s.id === p.playerId)
        const row = byPlayer.get(p.playerId) ?? {
          playerId: p.playerId,
          name: info?.name ?? p.playerId,
          photoURL: info?.photoURL ?? null,
          gamesPlayed: 0,
          wins: 0,
          totalPoints: 0,
          bailadas: 0,
        }
        row.gamesPlayed++
        if (p.rank === 1) row.wins++
        row.totalPoints += p.finalPoints
        row.bailadas += p.bailadasCount
        byPlayer.set(p.playerId, row)
      }
    }
    return toRanking([...byPlayer.values()])
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
