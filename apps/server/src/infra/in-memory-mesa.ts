import { normalizeCode } from '../application/lobby'
import type {
  MesaGameRow,
  MesaRecord,
  MesaRepository,
  SeasonRecord,
  SeasonResultRow,
  StandingAggregate,
} from '../application/ports'

/** In-memory mesas — tests, and local play without DATABASE_URL. */
export class InMemoryMesaRepository implements MesaRepository {
  readonly mesas = new Map<string, MesaRecord>()
  readonly memberships = new Map<string, Array<{ playerId: string; joinedAt: Date }>>()
  readonly seasons = new Map<string, SeasonRecord>()
  readonly links = new Map<string, { mesaId: string; seasonId: string | null; playedAt: Date }>()
  /** `${seasonId}:${gameId}` → rows, so re-recording a game replaces it. */
  readonly results = new Map<string, SeasonResultRow[]>()

  async create(input: {
    id: string
    code: string
    name: string
    createdBy: string
  }): Promise<MesaRecord> {
    const mesa: MesaRecord = { ...input, code: normalizeCode(input.code), createdAt: new Date() }
    this.mesas.set(mesa.id, mesa)
    this.memberships.set(mesa.id, [])
    return mesa
  }

  async byCode(code: string): Promise<MesaRecord | null> {
    const wanted = normalizeCode(code)
    return [...this.mesas.values()].find((m) => m.code === wanted) ?? null
  }

  async byId(mesaId: string): Promise<MesaRecord | null> {
    return this.mesas.get(mesaId) ?? null
  }

  async rename(mesaId: string, name: string): Promise<void> {
    const mesa = this.mesas.get(mesaId)
    if (mesa) this.mesas.set(mesaId, { ...mesa, name })
  }

  async addMember(mesaId: string, playerId: string): Promise<void> {
    const members = this.memberships.get(mesaId) ?? []
    if (!members.some((m) => m.playerId === playerId)) {
      members.push({ playerId, joinedAt: new Date() })
    }
    this.memberships.set(mesaId, members)
  }

  async removeMember(mesaId: string, playerId: string): Promise<void> {
    this.memberships.set(
      mesaId,
      (this.memberships.get(mesaId) ?? []).filter((m) => m.playerId !== playerId),
    )
  }

  async members(mesaId: string): Promise<Array<{ playerId: string; joinedAt: Date }>> {
    return [...(this.memberships.get(mesaId) ?? [])]
  }

  async listForPlayer(playerId: string): Promise<MesaRecord[]> {
    const ids = [...this.memberships.entries()]
      .filter(([, members]) => members.some((m) => m.playerId === playerId))
      .map(([mesaId]) => mesaId)
    return ids.flatMap((id) => {
      const mesa = this.mesas.get(id)
      return mesa ? [mesa] : []
    })
  }

  async activeSeason(mesaId: string): Promise<SeasonRecord | null> {
    return (
      [...this.seasons.values()]
        .filter((s) => s.mesaId === mesaId && s.status === 'active')
        .sort((a, b) => b.number - a.number)[0] ?? null
    )
  }

  async createSeason(input: {
    id: string
    mesaId: string
    number: number
    name: string
    startsAt: Date
    endsAt: Date
  }): Promise<SeasonRecord> {
    const season: SeasonRecord = { ...input, status: 'active', championId: null }
    this.seasons.set(season.id, season)
    return season
  }

  async finishSeason(seasonId: string, championId: string | null): Promise<void> {
    const season = this.seasons.get(seasonId)
    if (season) this.seasons.set(seasonId, { ...season, status: 'finished', championId })
  }

  async listSeasons(mesaId: string): Promise<SeasonRecord[]> {
    return [...this.seasons.values()].filter((s) => s.mesaId === mesaId)
  }

  async linkGame(gameId: string, mesaId: string, seasonId: string | null): Promise<void> {
    this.links.set(gameId, { mesaId, seasonId, playedAt: new Date() })
  }

  async gameLink(gameId: string): Promise<{ mesaId: string; seasonId: string | null } | null> {
    const link = this.links.get(gameId)
    return link ? { mesaId: link.mesaId, seasonId: link.seasonId } : null
  }

  async recordResults(
    seasonId: string,
    gameId: string,
    rows: SeasonResultRow[],
  ): Promise<void> {
    this.results.set(`${seasonId}:${gameId}`, rows.map((r) => ({ ...r })))
  }

  async standings(seasonId: string): Promise<StandingAggregate[]> {
    const byPlayer = new Map<string, StandingAggregate>()
    for (const [key, rows] of this.results) {
      if (!key.startsWith(`${seasonId}:`)) continue
      for (const row of rows) {
        const current = byPlayer.get(row.playerId) ?? {
          playerId: row.playerId,
          gamesPlayed: 0,
          wins: 0,
          points: 0,
          totalGamePoints: 0,
          bailadas: 0,
        }
        current.gamesPlayed++
        if (row.rank === 1) current.wins++
        current.points += row.seasonPoints
        current.totalGamePoints += row.gamePoints
        current.bailadas += row.bailadas
        byPlayer.set(row.playerId, current)
      }
    }
    return [...byPlayer.values()]
  }

  async recentGames(mesaId: string, limit: number): Promise<MesaGameRow[]> {
    return [...this.links.entries()]
      .filter(([, link]) => link.mesaId === mesaId)
      .sort((a, b) => b[1].playedAt.getTime() - a[1].playedAt.getTime())
      .slice(0, limit)
      .flatMap(([gameId, link]) => {
        const rows = link.seasonId ? this.results.get(`${link.seasonId}:${gameId}`) : undefined
        if (!rows?.length) return []
        const champion = rows.find((r) => r.rank === 1) ?? rows[0]!
        return [
          {
            gameId,
            playedAt: link.playedAt,
            playerCount: rows.length,
            championId: champion.playerId,
            championPoints: champion.gamePoints,
          },
        ]
      })
  }

  async gameCountsByPlayer(mesaId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const [gameId, link] of this.links) {
      if (link.mesaId !== mesaId || !link.seasonId) continue
      for (const row of this.results.get(`${link.seasonId}:${gameId}`) ?? []) {
        counts[row.playerId] = (counts[row.playerId] ?? 0) + 1
      }
    }
    return counts
  }
}
