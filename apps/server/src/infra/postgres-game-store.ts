import type { CompletedRoundResult } from '@bridou/engine'
import { eq, sql } from 'drizzle-orm'
import type { GameStateStore, StoredGameCurrent } from '../application/ports'
import type { Db } from '../db/client'
import { gameCurrent, gameRoundResults } from '../db/schema'

/** Postgres-backed live-game storage (see db/schema `gameCurrent` / `gameRoundResults`). */
export class PostgresGameStateStore implements GameStateStore {
  constructor(private readonly db: Db['db']) {}

  async upsertCurrent(row: StoredGameCurrent): Promise<void> {
    const values = {
      leaderId: row.leaderId,
      currentRoundNumber: row.currentRoundNumber,
      scoreboardShowing: row.scoreboardShowing,
      playerOrder: row.playerOrder,
      currentRound: row.currentRound,
      botSeats: row.botSeats,
      updatedAt: new Date(),
    }
    await this.db
      .insert(gameCurrent)
      .values({ gameId: row.gameId, ...values })
      .onConflictDoUpdate({ target: gameCurrent.gameId, set: values })
  }

  async insertRoundResult(
    gameId: string,
    roundNumber: number,
    results: CompletedRoundResult['results'],
  ): Promise<void> {
    await this.db
      .insert(gameRoundResults)
      .values({ gameId, roundNumber, results })
      .onConflictDoNothing()
  }

  async load(
    gameId: string,
  ): Promise<{ current: StoredGameCurrent; results: CompletedRoundResult[] } | null> {
    const [row] = await this.db
      .select()
      .from(gameCurrent)
      .where(eq(gameCurrent.gameId, gameId))
      .limit(1)
    if (!row) return null

    const rounds = await this.db
      .select()
      .from(gameRoundResults)
      .where(eq(gameRoundResults.gameId, gameId))
      .orderBy(gameRoundResults.roundNumber)

    return {
      current: {
        gameId: row.gameId,
        leaderId: row.leaderId,
        currentRoundNumber: row.currentRoundNumber,
        scoreboardShowing: row.scoreboardShowing,
        playerOrder: row.playerOrder,
        currentRound: row.currentRound,
        botSeats: row.botSeats,
      },
      results: rounds.map((r) => ({ roundNumber: r.roundNumber, results: r.results })),
    }
  }

  async delete(gameId: string): Promise<void> {
    await this.db.delete(gameRoundResults).where(eq(gameRoundResults.gameId, gameId))
    await this.db.delete(gameCurrent).where(eq(gameCurrent.gameId, gameId))
  }

  async findGameIdByPlayer(playerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ gameId: gameCurrent.gameId })
      .from(gameCurrent)
      .where(sql`${gameCurrent.playerOrder} @> ${JSON.stringify([{ id: playerId }])}::jsonb`)
      .limit(1)
    return row?.gameId ?? null
  }
}
