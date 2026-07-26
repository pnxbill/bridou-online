import { seasonPointsFor } from '@bridou/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { MesaService } from '../src/application/mesa'
import { MesaResultRecorder } from '../src/application/mesa-recorder'
import { OnlineTracker } from '../src/application/online'
import { InMemoryPlayerRepository } from '../src/infra/in-memory-history'
import { InMemoryMesaRepository } from '../src/infra/in-memory-mesa'

const ANA = { id: 'ana', name: 'Ana' }
const BRU = { id: 'bru', name: 'Bruno' }
const CAI = { id: 'cai', name: 'Caio' }

describe('seasonPointsFor', () => {
  it('scales placement with table size and adds a flat bonus for winning', () => {
    // 5-player table: 1st = 5 placement + 2 bonus
    expect(seasonPointsFor(1, 5)).toBe(7)
    expect(seasonPointsFor(2, 5)).toBe(4)
    expect(seasonPointsFor(5, 5)).toBe(1)
    // beating six people is worth more than beating one
    expect(seasonPointsFor(1, 7)).toBeGreaterThan(seasonPointsFor(1, 2))
  })

  it('never lets a run of second places quietly out-rank winning', () => {
    // two wins at a 4-table (2×6) beats three seconds (3×3)
    expect(seasonPointsFor(1, 4) * 2).toBeGreaterThan(seasonPointsFor(2, 4) * 3)
  })
})

describe('MesaService', () => {
  let repo: InMemoryMesaRepository
  let players: InMemoryPlayerRepository
  let mesas: MesaService
  let now: Date

  const build = (over: { seasonWeeks?: number } = {}) => {
    repo = new InMemoryMesaRepository()
    players = new InMemoryPlayerRepository()
    now = new Date('2026-03-01T12:00:00Z')
    let codeSeq = 0
    mesas = new MesaService(repo, players, {
      now: () => now,
      generateCode: () => `MESA${(codeSeq++).toString(36).toUpperCase()}`,
      ...over,
    })
  }

  beforeEach(() => build())

  it('creates a mesa with a permanent code, the creator seated, and a live season', async () => {
    const mesa = await mesas.create('Mesa dos Cunhados', ANA)

    expect(mesa.name).toBe('Mesa dos Cunhados')
    expect(mesa.code).toMatch(/^MESA/)
    expect(mesa.memberCount).toBe(1)

    const detail = await mesas.detail(mesa.code)
    expect(detail.members.map((m) => m.id)).toEqual(['ana'])
    expect(detail.season?.number).toBe(1)
    expect(detail.season?.status).toBe('active')
  })

  it('rejects a blank or overlong name', async () => {
    await expect(mesas.create('   ', ANA)).rejects.toThrow(/nome/i)
    await expect(mesas.create('x'.repeat(41), ANA)).rejects.toThrow(/longo/i)
  })

  it('is idempotent on join and finds the mesa case-insensitively', async () => {
    const mesa = await mesas.create('Quinta Santa', ANA)
    await mesas.join(mesa.code.toLowerCase(), BRU)
    await mesas.join(mesa.code, BRU)

    const detail = await mesas.detail(mesa.code)
    expect(detail.members).toHaveLength(2)
  })

  it('only lists mesas the player belongs to', async () => {
    const mine = await mesas.create('Minha', ANA)
    await mesas.create('Outra', BRU)

    const listed = await mesas.listForPlayer('ana')
    expect(listed.map((m) => m.name)).toEqual([mine.name])
  })

  it('refuses to open a table for a non-member', async () => {
    const mesa = await mesas.create('Fechada', ANA)
    const record = await mesas.byCode(mesa.code)
    await expect(mesas.assertMember(record!.id, 'bru')).rejects.toThrow(/não é dessa mesa/i)
    await expect(mesas.assertMember(record!.id, 'ana')).resolves.toBeUndefined()
  })

  describe('standings', () => {
    const finishGame = async (
      gameId: string,
      mesaCode: string,
      order: Array<{ id: string; totalPoints: number; isBot?: boolean }>,
      bailadas: Record<string, number> = {},
    ) => {
      const mesa = await mesas.byCode(mesaCode)
      await mesas.linkGame(gameId, mesa!.id)
      await mesas.recordFinishedGame({
        gameId,
        scoreboard: order,
        bailadasByPlayer: bailadas,
      })
    }

    it('accumulates season points, wins and bailadas across games', async () => {
      const mesa = await mesas.create('Standings', ANA)
      await mesas.join(mesa.code, BRU)
      await mesas.join(mesa.code, CAI)

      await finishGame(
        'g1',
        mesa.code,
        [
          { id: 'ana', totalPoints: 120 },
          { id: 'bru', totalPoints: 100 },
          { id: 'cai', totalPoints: 80 },
        ],
        { ana: 1, bru: 3, cai: 5 },
      )
      await finishGame('g2', mesa.code, [
        { id: 'bru', totalPoints: 130 },
        { id: 'ana', totalPoints: 110 },
        { id: 'cai', totalPoints: 90 },
      ])

      const detail = await mesas.detail(mesa.code)
      const [first, second, third] = detail.standings

      // each won once at a 3-table: 3 placement + 2 bonus = 5, plus one 2nd (2)
      expect(first?.points).toBe(7)
      expect(second?.points).toBe(7)
      expect(third?.points).toBe(2)
      expect(first?.gamesPlayed).toBe(2)
      expect(first?.wins).toBe(1)
      expect(detail.standings.map((s) => s.position)).toEqual([1, 2, 3])
      expect(detail.standings.find((s) => s.id === 'cai')?.bailadas).toBe(5)
    })

    it('keeps bot seats out of the standings entirely', async () => {
      const mesa = await mesas.create('Com bot', ANA)
      await finishGame('g1', mesa.code, [
        { id: 'bot-1', totalPoints: 140, isBot: true },
        { id: 'ana', totalPoints: 100 },
      ])

      const detail = await mesas.detail(mesa.code)
      expect(detail.standings.map((s) => s.id)).toEqual(['ana'])
      // Ana still scores for the seat she actually finished in
      expect(detail.standings[0]?.wins).toBe(0)
    })

    it('ignores a game that was never opened from a mesa', async () => {
      const mesa = await mesas.create('Vazia', ANA)
      await mesas.recordFinishedGame({
        gameId: 'unlinked',
        scoreboard: [{ id: 'ana', totalPoints: 100 }],
        bailadasByPlayer: {},
      })
      const detail = await mesas.detail(mesa.code)
      expect(detail.standings).toEqual([])
    })

    it('shows the mesa mural newest first with the champion named', async () => {
      const mesa = await mesas.create('Mural', ANA)
      await mesas.join(mesa.code, BRU)
      await finishGame('g1', mesa.code, [
        { id: 'ana', totalPoints: 120 },
        { id: 'bru', totalPoints: 90 },
      ])

      const detail = await mesas.detail(mesa.code)
      expect(detail.recentGames).toHaveLength(1)
      expect(detail.recentGames[0]).toMatchObject({
        gameId: 'g1',
        championId: 'ana',
        championName: 'Ana',
        championPoints: 120,
        playerCount: 2,
      })
    })
  })

  describe('season rollover', () => {
    it('crowns the champion and opens the next season once the clock runs out', async () => {
      build({ seasonWeeks: 1 })
      const mesa = await mesas.create('Temporadas', ANA)
      await mesas.join(mesa.code, BRU)

      const record = await mesas.byCode(mesa.code)
      await mesas.linkGame('g1', record!.id)
      await mesas.recordFinishedGame({
        gameId: 'g1',
        scoreboard: [
          { id: 'ana', totalPoints: 120 },
          { id: 'bru', totalPoints: 90 },
        ],
        bailadasByPlayer: {},
      })

      const first = await mesas.detail(mesa.code)
      expect(first.season?.number).toBe(1)
      expect(first.pastSeasons).toHaveLength(0)

      // jump past the season's end
      now = new Date('2026-04-01T12:00:00Z')

      const rolled = await mesas.detail(mesa.code)
      expect(rolled.season?.number).toBe(2)
      expect(rolled.season?.status).toBe('active')
      // the new season starts empty
      expect(rolled.standings).toEqual([])

      expect(rolled.pastSeasons).toHaveLength(1)
      expect(rolled.pastSeasons[0]).toMatchObject({
        number: 1,
        status: 'finished',
        championId: 'ana',
      })
    })

    it('does not roll a season that is still running', async () => {
      const mesa = await mesas.create('Corrente', ANA)
      const before = await mesas.detail(mesa.code)
      now = new Date('2026-03-05T12:00:00Z')
      const after = await mesas.detail(mesa.code)
      expect(after.season?.id).toBe(before.season?.id)
    })
  })
})

describe('MesaResultRecorder', () => {
  it('counts bailadas from round-ended and files the result at game-ended', async () => {
    const repo = new InMemoryMesaRepository()
    const players = new InMemoryPlayerRepository()
    const mesas = new MesaService(repo, players, { generateCode: () => 'CODE1' })
    const recorder = new MesaResultRecorder(mesas)

    const mesa = await mesas.create('Recorder', ANA)
    const record = await mesas.byCode(mesa.code)
    await mesas.join(mesa.code, BRU)

    recorder.registerGame('g1', record!.id)
    const bailador = { ...BRU, bet: 2, made: 1, points: -1 }
    recorder.onDomainEvent('g1', { type: 'round-ended', bailadores: [bailador] })
    recorder.onDomainEvent('g1', { type: 'round-ended', bailadores: [bailador] })
    recorder.onDomainEvent('g1', {
      type: 'game-ended',
      scoreboard: [
        { ...ANA, totalPoints: 120 },
        { ...BRU, totalPoints: 90 },
      ],
    })
    await recorder.flush('g1')

    const detail = await mesas.detail(mesa.code)
    expect(detail.standings.find((s) => s.id === 'bru')?.bailadas).toBe(2)
    expect(detail.standings.find((s) => s.id === 'ana')?.wins).toBe(1)
  })

  it('does nothing for a game with no mesa behind it', async () => {
    const repo = new InMemoryMesaRepository()
    const mesas = new MesaService(repo, new InMemoryPlayerRepository())
    const recorder = new MesaResultRecorder(mesas)

    recorder.registerGame('solo', null)
    recorder.onDomainEvent('solo', {
      type: 'game-ended',
      scoreboard: [{ ...ANA, totalPoints: 100 }],
    })
    await expect(recorder.flush('solo')).resolves.toBeUndefined()
    expect(repo.results.size).toBe(0)
  })
})

describe('OnlineTracker', () => {
  it('expires a player once the TTL passes', () => {
    let clock = 1000
    const tracker = new OnlineTracker(500, () => clock)

    tracker.touch('ana')
    expect(tracker.isOnline('ana')).toBe(true)
    expect([...tracker.onlinePlayerIds()]).toEqual(['ana'])

    clock += 600
    expect(tracker.isOnline('ana')).toBe(false)
    expect([...tracker.onlinePlayerIds()]).toEqual([])
  })

  it('keeps a player online while they keep acting', () => {
    let clock = 0
    const tracker = new OnlineTracker(500, () => clock)
    tracker.touch('ana')
    clock += 400
    tracker.touch('ana')
    clock += 400
    expect(tracker.isOnline('ana')).toBe(true)
  })
})
