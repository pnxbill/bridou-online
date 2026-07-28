import {
  MESA_NAME_MAX,
  SEASON_WEEKS,
  seasonPointsFor,
  type MesaDetail,
  type MesaSummary,
  type PlayerInfo,
  type SeasonSummary,
  type StandingRow,
} from '@bridou/shared'
import { GameError } from '@bridou/engine'
import { randomUUID } from 'node:crypto'
import { ForbiddenError, NotFoundError } from './errors'
import { normalizeCode } from './lobby'
import type {
  MesaRecord,
  MesaRepository,
  PlayerRepository,
  SeasonRecord,
  SeasonResultRow,
} from './ports'

/**
 * Mesas — persistent groups of friends, and the seasons they play.
 *
 * This is the answer to the actual retention problem: getting four people to
 * the same table again is a coordination problem, not a motivation one. A mesa
 * gives the group a permanent address, a standing that carries between nights,
 * and a season with an end date to play before.
 */

/** Uppercase letters/digits that survive handwriting and voice: no 0/O, 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5

const randomCode = (): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('')

const MAX_MEMBERS = 30

export interface MesaServiceOptions {
  now?: () => Date
  generateCode?: () => string
  seasonWeeks?: number
}

export class MesaService {
  private readonly now: () => Date
  private readonly generateCode: () => string
  private readonly seasonWeeks: number

  constructor(
    private readonly mesas: MesaRepository,
    private readonly players: PlayerRepository,
    options: MesaServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.generateCode = options.generateCode ?? randomCode
    this.seasonWeeks = options.seasonWeeks ?? SEASON_WEEKS
  }

  async create(name: string, creator: PlayerInfo): Promise<MesaSummary> {
    const trimmed = name.trim()
    if (!trimmed) throw new GameError('A mesa precisa de um nome')
    if (trimmed.length > MESA_NAME_MAX) {
      throw new GameError(`Nome muito longo (máx ${MESA_NAME_MAX})`)
    }

    // Retry on collision; the code is permanent, so it must be unique for good.
    let code = this.generateCode()
    for (let attempt = 0; attempt < 12 && (await this.mesas.byCode(code)); attempt++) {
      code = this.generateCode()
    }
    if (await this.mesas.byCode(code)) throw new GameError('Não deu pra gerar um código, tente de novo')

    await this.players.upsert(creator)
    const mesa = await this.mesas.create({
      id: randomUUID(),
      code,
      name: trimmed,
      createdBy: creator.id,
    })
    await this.mesas.addMember(mesa.id, creator.id)
    await this.ensureSeason(mesa.id)
    return this.summarize(mesa, 1)
  }

  async join(code: string, player: PlayerInfo): Promise<MesaSummary> {
    const mesa = await this.requireByCode(code)
    const members = await this.mesas.members(mesa.id)
    if (!members.some((m) => m.playerId === player.id)) {
      if (members.length >= MAX_MEMBERS) throw new GameError('Essa mesa está cheia')
      await this.players.upsert(player)
      await this.mesas.addMember(mesa.id, player.id)
      return this.summarize(mesa, members.length + 1)
    }
    return this.summarize(mesa, members.length)
  }

  async leave(mesaId: string, playerId: string): Promise<void> {
    await this.requireById(mesaId)
    await this.mesas.removeMember(mesaId, playerId)
  }

  async listForPlayer(playerId: string): Promise<MesaSummary[]> {
    const mesas = await this.mesas.listForPlayer(playerId)
    return Promise.all(
      mesas.map(async (mesa) =>
        this.summarize(mesa, (await this.mesas.members(mesa.id)).length),
      ),
    )
  }

  /**
   * Full mesa view: roster, live season, standings and the mural.
   * `onlineIds` comes from presence, which the service deliberately doesn't own.
   */
  async detail(code: string, onlineIds: ReadonlySet<string> = new Set()): Promise<MesaDetail> {
    const mesa = await this.requireByCode(code)
    const season = await this.ensureSeason(mesa.id)

    const [memberRows, seasons, recentGames, gameCounts] = await Promise.all([
      this.mesas.members(mesa.id),
      this.mesas.listSeasons(mesa.id),
      this.mesas.recentGames(mesa.id, 10),
      this.mesas.gameCountsByPlayer(mesa.id),
    ])

    const infos = await this.players.getMany(memberRows.map((m) => m.playerId))
    const infoById = new Map(infos.map((i) => [i.id, i]))

    const members = memberRows.map((row) => {
      const info = infoById.get(row.playerId)
      return {
        id: row.playerId,
        name: info?.name ?? 'Jogador',
        ...(info?.photoURL ? { photoURL: info.photoURL } : {}),
        joinedAt: row.joinedAt.toISOString(),
        online: onlineIds.has(row.playerId),
        gamesPlayed: gameCounts[row.playerId] ?? 0,
      }
    })

    const standings = season ? await this.standings(season.id) : []
    const championNames = await this.players.getMany(
      recentGames.map((g) => g.championId).filter(Boolean),
    )
    const championById = new Map(championNames.map((c) => [c.id, c.name]))

    return {
      mesa: this.summarize(mesa, members.length, members.filter((m) => m.online).length),
      members,
      season: season ? toSeasonSummary(season) : null,
      standings,
      recentGames: recentGames.map((g) => ({
        gameId: g.gameId,
        playedAt: g.playedAt.toISOString(),
        playerCount: g.playerCount,
        championId: g.championId,
        championName: championById.get(g.championId) ?? 'Alguém',
        championPoints: g.championPoints,
      })),
      pastSeasons: seasons
        .filter((s) => s.status === 'finished')
        .sort((a, b) => b.number - a.number)
        .map(toSeasonSummary),
    }
  }

  async standings(seasonId: string): Promise<StandingRow[]> {
    const rows = await this.mesas.standings(seasonId)
    const infos = await this.players.getMany(rows.map((r) => r.playerId))
    const infoById = new Map(infos.map((i) => [i.id, i]))

    return rows
      .map((row) => {
        const info = infoById.get(row.playerId)
        return {
          id: row.playerId,
          name: info?.name ?? 'Jogador',
          ...(info?.photoURL ? { photoURL: info.photoURL } : {}),
          position: 0,
          gamesPlayed: row.gamesPlayed,
          wins: row.wins,
          points: row.points,
          totalGamePoints: row.totalGamePoints,
          bailadas: row.bailadas,
        }
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.wins - a.wins ||
          b.totalGamePoints - a.totalGamePoints ||
          a.name.localeCompare(b.name),
      )
      .map((row, i) => ({ ...row, position: i + 1 }))
  }

  /** Members eligible to be seated when a game opens from this mesa. */
  async assertMember(mesaId: string, playerId: string): Promise<void> {
    const members = await this.mesas.members(mesaId)
    if (!members.some((m) => m.playerId === playerId)) {
      throw new ForbiddenError('Você não é dessa mesa')
    }
  }

  async byCode(code: string): Promise<MesaRecord | null> {
    return this.mesas.byCode(normalizeCode(code))
  }

  /** Called when a game starts from a mesa, so results can flow back. */
  async linkGame(gameId: string, mesaId: string): Promise<void> {
    const season = await this.ensureSeason(mesaId)
    await this.mesas.linkGame(gameId, mesaId, season?.id ?? null)
  }

  /**
   * Writes a finished game into its season. Called from the event tee at
   * `game-ended`; a game not opened from a mesa is simply ignored.
   */
  async recordFinishedGame(input: {
    gameId: string
    scoreboard: Array<{ id: string; totalPoints: number; isBot?: boolean }>
    bailadasByPlayer: Record<string, number>
  }): Promise<void> {
    const link = await this.mesas.gameLink(input.gameId)
    if (!link?.seasonId) return

    const ranked = [...input.scoreboard].sort((a, b) => b.totalPoints - a.totalPoints)
    const playerCount = ranked.length
    const rows: SeasonResultRow[] = ranked.flatMap((entry, i) => {
      if (entry.isBot) return []
      return [
        {
          playerId: entry.id,
          rank: i + 1,
          seasonPoints: seasonPointsFor(i + 1, playerCount),
          gamePoints: entry.totalPoints,
          bailadas: input.bailadasByPlayer[entry.id] ?? 0,
        },
      ]
    })
    if (rows.length) await this.mesas.recordResults(link.seasonId, input.gameId, rows)
  }

  /**
   * Returns the mesa's live season, rolling it over when the last one ran out.
   * Rollover crowns the champion from the final standings, which is what makes
   * a season worth chasing in its last week.
   */
  async ensureSeason(mesaId: string): Promise<SeasonRecord | null> {
    const current = await this.mesas.activeSeason(mesaId)
    const now = this.now()
    if (current && current.endsAt > now) return current

    if (current) {
      const table = await this.standings(current.id)
      await this.mesas.finishSeason(current.id, table[0]?.id ?? null)
    }

    const number = (current?.number ?? 0) + 1
    const endsAt = new Date(now.getTime() + this.seasonWeeks * 7 * 24 * 60 * 60 * 1000)
    return this.mesas.createSeason({
      id: randomUUID(),
      mesaId,
      number,
      name: `Temporada ${number}`,
      startsAt: now,
      endsAt,
    })
  }

  private summarize(mesa: MesaRecord, memberCount: number, onlineCount = 0): MesaSummary {
    return {
      id: mesa.id,
      code: mesa.code,
      name: mesa.name,
      createdBy: mesa.createdBy,
      createdAt: mesa.createdAt.toISOString(),
      memberCount,
      onlineCount,
    }
  }

  private async requireByCode(code: string): Promise<MesaRecord> {
    const mesa = await this.mesas.byCode(normalizeCode(code))
    if (!mesa) throw new NotFoundError('Mesa não encontrada')
    return mesa
  }

  private async requireById(mesaId: string): Promise<MesaRecord> {
    const mesa = await this.mesas.byId(mesaId)
    if (!mesa) throw new NotFoundError('Mesa não encontrada')
    return mesa
  }
}

const toSeasonSummary = (season: SeasonRecord): SeasonSummary => ({
  id: season.id,
  mesaId: season.mesaId,
  name: season.name,
  number: season.number,
  startsAt: season.startsAt.toISOString(),
  endsAt: season.endsAt.toISOString(),
  status: season.status,
  championId: season.championId,
})
