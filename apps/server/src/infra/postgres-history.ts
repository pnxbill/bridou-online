import type { DomainEvent, PlayerInfo } from '@bridou/shared'
import { eq } from 'drizzle-orm'
import type {
  FinishedGameRecord,
  GameHistoryRepository,
  PlayerRepository,
  StoredGameEvent,
} from '../application/ports'
import type { Db } from '../db/client'
import { gameEvents, gamePlayers, games, players } from '../db/schema'

const eventPlayerId = (event: DomainEvent): string | null =>
  'playerId' in event ? event.playerId : null

export class PostgresPlayerRepository implements PlayerRepository {
  constructor(private readonly db: Db['db']) {}

  async upsert(player: PlayerInfo): Promise<void> {
    const now = new Date()
    await this.db
      .insert(players)
      .values({
        id: player.id,
        displayName: player.name,
        photoUrl: player.photoURL ?? null,
        isBot: !!player.isBot,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: players.id,
        set: {
          displayName: player.name,
          photoUrl: player.photoURL ?? null,
          isBot: !!player.isBot,
          updatedAt: now,
        },
      })
  }
}

export class PostgresGameHistoryRepository implements GameHistoryRepository {
  constructor(private readonly db: Db['db']) {}

  async ensureGameStarted(input: {
    gameId: string
    leaderId: string
    playerCount: number
    startedAt?: Date
  }): Promise<void> {
    await this.db
      .insert(games)
      .values({
        id: input.gameId,
        startedAt: input.startedAt ?? new Date(),
        leaderId: input.leaderId,
        playerCount: input.playerCount,
        status: 'in_progress',
      })
      .onConflictDoNothing()
  }

  async appendEvent(gameId: string, seq: number, event: DomainEvent): Promise<void> {
    await this.db.insert(gameEvents).values({
      gameId,
      seq,
      type: event.type,
      playerId: eventPlayerId(event),
      payload: event,
      createdAt: new Date(),
    })
  }

  async saveFinishedGame(record: FinishedGameRecord): Promise<void> {
    await this.db
      .insert(games)
      .values({
        id: record.gameId,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        leaderId: record.leaderId,
        playerCount: record.players.length,
        finalScoreboard: record.finalScoreboard,
        status: 'finished',
      })
      .onConflictDoUpdate({
        target: games.id,
        set: {
          endedAt: record.endedAt,
          finalScoreboard: record.finalScoreboard,
          status: 'finished',
          playerCount: record.players.length,
        },
      })

    for (const p of record.players) {
      await this.db
        .insert(gamePlayers)
        .values({
          gameId: record.gameId,
          playerId: p.playerId,
          seatIndex: p.seatIndex,
          isBot: p.isBot,
          finalPoints: p.finalPoints,
          bailadasCount: p.bailadasCount,
          rank: p.rank,
        })
        .onConflictDoUpdate({
          target: [gamePlayers.gameId, gamePlayers.playerId],
          set: {
            finalPoints: p.finalPoints,
            bailadasCount: p.bailadasCount,
            rank: p.rank,
            isBot: p.isBot,
            seatIndex: p.seatIndex,
          },
        })
    }
  }

  async getGameEvents(gameId: string): Promise<StoredGameEvent[]> {
    const rows = await this.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameId, gameId))
      .orderBy(gameEvents.seq)

    return rows.map((row) => ({
      gameId: row.gameId,
      seq: row.seq,
      type: row.type as DomainEvent['type'],
      playerId: row.playerId,
      payload: row.payload,
      createdAt: row.createdAt,
    }))
  }

  async listPlayerGames(playerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ gameId: gamePlayers.gameId })
      .from(gamePlayers)
      .where(eq(gamePlayers.playerId, playerId))
    return rows.map((r) => r.gameId)
  }
}
