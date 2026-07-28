import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { normalizeCode } from '../application/lobby'
import type {
  MesaGameRow,
  MesaRecord,
  MesaRepository,
  SeasonRecord,
  SeasonResultRow,
  StandingAggregate,
} from '../application/ports'
import type { Db } from '../db/client'
import { mesaGames, mesaMembers, mesas, seasonResults, seasons } from '../db/schema'

type SeasonRow = typeof seasons.$inferSelect

const toSeason = (row: SeasonRow): SeasonRecord => ({
  id: row.id,
  mesaId: row.mesaId,
  number: row.number,
  name: row.name,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  status: row.status === 'finished' ? 'finished' : 'active',
  championId: row.championId,
})

export class PostgresMesaRepository implements MesaRepository {
  constructor(private readonly db: Db['db']) {}

  async create(input: {
    id: string
    code: string
    name: string
    createdBy: string
  }): Promise<MesaRecord> {
    const [row] = await this.db
      .insert(mesas)
      .values({ ...input, code: normalizeCode(input.code), createdAt: new Date() })
      .returning()
    if (!row) throw new Error('Failed to create mesa')
    return row
  }

  async byCode(code: string): Promise<MesaRecord | null> {
    const [row] = await this.db.select().from(mesas).where(eq(mesas.code, normalizeCode(code)))
    return row ?? null
  }

  async byId(mesaId: string): Promise<MesaRecord | null> {
    const [row] = await this.db.select().from(mesas).where(eq(mesas.id, mesaId))
    return row ?? null
  }

  async rename(mesaId: string, name: string): Promise<void> {
    await this.db.update(mesas).set({ name }).where(eq(mesas.id, mesaId))
  }

  async addMember(mesaId: string, playerId: string): Promise<void> {
    await this.db
      .insert(mesaMembers)
      .values({ mesaId, playerId, joinedAt: new Date() })
      .onConflictDoNothing()
  }

  async removeMember(mesaId: string, playerId: string): Promise<void> {
    await this.db
      .delete(mesaMembers)
      .where(and(eq(mesaMembers.mesaId, mesaId), eq(mesaMembers.playerId, playerId)))
  }

  async members(mesaId: string): Promise<Array<{ playerId: string; joinedAt: Date }>> {
    return this.db
      .select({ playerId: mesaMembers.playerId, joinedAt: mesaMembers.joinedAt })
      .from(mesaMembers)
      .where(eq(mesaMembers.mesaId, mesaId))
      .orderBy(mesaMembers.joinedAt)
  }

  async listForPlayer(playerId: string): Promise<MesaRecord[]> {
    const rows = await this.db
      .select({ mesa: mesas })
      .from(mesaMembers)
      .innerJoin(mesas, eq(mesaMembers.mesaId, mesas.id))
      .where(eq(mesaMembers.playerId, playerId))
      .orderBy(desc(mesas.createdAt))
    return rows.map((r) => r.mesa)
  }

  async activeSeason(mesaId: string): Promise<SeasonRecord | null> {
    const [row] = await this.db
      .select()
      .from(seasons)
      .where(and(eq(seasons.mesaId, mesaId), eq(seasons.status, 'active')))
      .orderBy(desc(seasons.number))
      .limit(1)
    return row ? toSeason(row) : null
  }

  async createSeason(input: {
    id: string
    mesaId: string
    number: number
    name: string
    startsAt: Date
    endsAt: Date
  }): Promise<SeasonRecord> {
    const [row] = await this.db
      .insert(seasons)
      .values({ ...input, status: 'active' })
      .returning()
    if (!row) throw new Error('Failed to create season')
    return toSeason(row)
  }

  async finishSeason(seasonId: string, championId: string | null): Promise<void> {
    await this.db
      .update(seasons)
      .set({ status: 'finished', championId })
      .where(eq(seasons.id, seasonId))
  }

  async listSeasons(mesaId: string): Promise<SeasonRecord[]> {
    const rows = await this.db
      .select()
      .from(seasons)
      .where(eq(seasons.mesaId, mesaId))
      .orderBy(desc(seasons.number))
    return rows.map(toSeason)
  }

  async linkGame(gameId: string, mesaId: string, seasonId: string | null): Promise<void> {
    await this.db
      .insert(mesaGames)
      .values({ gameId, mesaId, seasonId, playedAt: new Date() })
      .onConflictDoNothing()
  }

  async gameLink(gameId: string): Promise<{ mesaId: string; seasonId: string | null } | null> {
    const [row] = await this.db
      .select({ mesaId: mesaGames.mesaId, seasonId: mesaGames.seasonId })
      .from(mesaGames)
      .where(eq(mesaGames.gameId, gameId))
    return row ?? null
  }

  async recordResults(
    seasonId: string,
    gameId: string,
    rows: SeasonResultRow[],
  ): Promise<void> {
    if (!rows.length) return
    await this.db
      .insert(seasonResults)
      .values(rows.map((row) => ({ ...row, seasonId, gameId })))
      .onConflictDoNothing()
  }

  async standings(seasonId: string): Promise<StandingAggregate[]> {
    return this.db
      .select({
        playerId: seasonResults.playerId,
        gamesPlayed: sql<number>`count(*)::int`,
        wins: sql<number>`(count(*) filter (where ${seasonResults.rank} = 1))::int`,
        points: sql<number>`coalesce(sum(${seasonResults.seasonPoints}), 0)::int`,
        totalGamePoints: sql<number>`coalesce(sum(${seasonResults.gamePoints}), 0)::int`,
        bailadas: sql<number>`coalesce(sum(${seasonResults.bailadas}), 0)::int`,
      })
      .from(seasonResults)
      .where(eq(seasonResults.seasonId, seasonId))
      .groupBy(seasonResults.playerId)
  }

  async recentGames(mesaId: string, limit: number): Promise<MesaGameRow[]> {
    const links = await this.db
      .select({ gameId: mesaGames.gameId, playedAt: mesaGames.playedAt })
      .from(mesaGames)
      .where(eq(mesaGames.mesaId, mesaId))
      .orderBy(desc(mesaGames.playedAt))
      .limit(limit)
    if (!links.length) return []

    const rows = await this.db
      .select({
        gameId: seasonResults.gameId,
        playerId: seasonResults.playerId,
        rank: seasonResults.rank,
        gamePoints: seasonResults.gamePoints,
      })
      .from(seasonResults)
      .where(
        inArray(
          seasonResults.gameId,
          links.map((l) => l.gameId),
        ),
      )

    return links.flatMap((link) => {
      const forGame = rows.filter((r) => r.gameId === link.gameId)
      const champion = forGame.find((r) => r.rank === 1)
      if (!champion) return []
      return [
        {
          gameId: link.gameId,
          playedAt: link.playedAt,
          playerCount: forGame.length,
          championId: champion.playerId,
          championPoints: champion.gamePoints,
        },
      ]
    })
  }

  async gameCountsByPlayer(mesaId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        playerId: seasonResults.playerId,
        count: sql<number>`count(*)::int`,
      })
      .from(seasonResults)
      .innerJoin(mesaGames, eq(seasonResults.gameId, mesaGames.gameId))
      .where(eq(mesaGames.mesaId, mesaId))
      .groupBy(seasonResults.playerId)

    return Object.fromEntries(rows.map((r) => [r.playerId, r.count]))
  }
}
