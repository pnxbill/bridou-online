import type {
  Card,
  DomainEvent,
  EventPublisher,
  PlayerInfo,
  RoundPlayer,
  ScoreboardEntry,
} from '@bridou/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { AchievementTracker } from '../src/application/achievements'
import {
  InMemoryAchievementRepository,
  InMemoryPlayerStatsRepository,
} from '../src/infra/in-memory-engagement'

/**
 * Drives the tracker with the same DomainEvent shapes the engine publishes,
 * so these tests break if the wire contract the tracker reads ever changes.
 */

const GAME = 'game-1'

const asRoundPlayer = (p: PlayerInfo): RoundPlayer => ({ ...p, bet: null, made: null, points: null })

class CapturingPublisher implements EventPublisher {
  readonly events: DomainEvent[] = []
  publish(event: DomainEvent): void {
    this.events.push(event)
  }
}

interface RoundSpec {
  roundNumber: number
  cards: number
  trunfo?: Card
  /** Bets by player id. */
  bets: Record<string, number>
  /** Trick winners in order, optionally with the card that won each. */
  winners: Array<string | { id: string; card: Card }>
}

describe('AchievementTracker', () => {
  let achievements: InMemoryAchievementRepository
  let stats: InMemoryPlayerStatsRepository
  let publisher: CapturingPublisher
  let tracker: AchievementTracker

  const players: PlayerInfo[] = [
    { id: 'ana', name: 'Ana' },
    { id: 'bru', name: 'Bruno' },
    { id: 'car', name: 'Carla' },
  ]

  const withBot: PlayerInfo[] = [
    { id: 'ana', name: 'Ana' },
    { id: 'bru', name: 'Bruno' },
    { id: 'bot-1', name: 'Botelho', isBot: true },
  ]

  /** Whoever is seated for the game under test — the round helpers read it. */
  let seated: PlayerInfo[]

  /** Fixed clock so the time-of-day conquistas are deterministic (21:00 BRT). */
  const eveningClock = () => new Date('2026-03-10T21:00:00-03:00')

  const build = (now = eveningClock, roster: PlayerInfo[] = players) => {
    achievements = new InMemoryAchievementRepository()
    stats = new InMemoryPlayerStatsRepository()
    publisher = new CapturingPublisher()
    seated = roster
    tracker = new AchievementTracker({ achievements, stats, now })
    tracker.bind({ publisherFor: () => publisher })
    tracker.registerGame(GAME, roster, 'ana')
  }

  const send = (event: DomainEvent) => tracker.onDomainEvent(GAME, event)

  /** Emits the full event sequence for one round. */
  const playRound = ({ roundNumber, cards, trunfo = 'K-♠️', bets, winners }: RoundSpec) => {
    const roundPlayers = seated.map(asRoundPlayer)
    send({
      type: 'round-started',
      round: {
        currentRoundNumber: roundNumber,
        cardsForEachPlayer: cards,
        numOfPlayers: seated.length,
        trunfo,
        players: roundPlayers,
        betting: true,
        turns: [],
        currentTurn: null,
        whoMade: [],
        bailadores: [],
      },
    })
    send({ type: 'trunfo-set', trunfo })
    for (const [playerId, bet] of Object.entries(bets)) {
      send({ type: 'player-bet', playerId, bet })
    }
    for (const winner of winners) {
      const winnerId = typeof winner === 'string' ? winner : winner.id
      const card = typeof winner === 'string' ? '9-♦️' : winner.card
      // The winner's card sits at the winner's index in playedCards.
      const playedCards = seated.map((p) => (p.id === winnerId ? card : '2-♦️'))
      send({
        type: 'turn-ended',
        turn: { players: roundPlayers, suit: '♦️', playedCards, trunfo },
        winnerId,
      })
    }
    send({ type: 'round-ended', bailadores: [] })
  }

  const endGame = (scoreboard: ScoreboardEntry[]) => send({ type: 'game-ended', scoreboard })

  const unlockedBy = (playerId: string) =>
    achievements.unlocks.filter((u) => u.playerId === playerId).map((u) => u.achievementId)

  beforeEach(() => build())

  it('awards a round conquista live and publishes it to the table', async () => {
    // Ana bets 5 and makes 5 — kamikaze.
    playRound({
      roundNumber: 6,
      cards: 6,
      bets: { ana: 5, bru: 1, car: 0 },
      winners: ['ana', 'ana', 'ana', 'ana', 'ana', 'bru'],
    })
    await tracker.flush()

    expect(unlockedBy('ana')).toContain('kamikaze')
    expect(publisher.events).toContainEqual(
      expect.objectContaining({
        type: 'achievement-unlocked',
        playerId: 'ana',
        achievementId: 'kamikaze',
      }),
    )
  })

  it('never publishes the same conquista twice', async () => {
    const kamikaze = {
      cards: 6,
      bets: { ana: 5, bru: 1, car: 0 },
      winners: ['ana', 'ana', 'ana', 'ana', 'ana', 'bru'],
    }
    playRound({ roundNumber: 6, ...kamikaze })
    playRound({ roundNumber: 8, ...kamikaze })
    await tracker.flush()

    const unlocks = publisher.events.filter(
      (e) => e.type === 'achievement-unlocked' && e.achievementId === 'kamikaze',
    )
    expect(unlocks).toHaveLength(1)
  })

  it('tracks exact-bet streaks across rounds and resets them on a bailada', async () => {
    // Ana calls the single trick every round; Bruno calls it too and never gets it.
    for (const roundNumber of [1, 2]) {
      playRound({
        roundNumber,
        cards: 1,
        bets: { ana: 1, bru: 1, car: 0 },
        winners: ['ana'],
      })
    }
    await tracker.flush()
    expect(unlockedBy('ana')).not.toContain('mao-de-ferro')
    expect(unlockedBy('bru')).not.toContain('pe-frio')

    // third exact bet in a row for Ana, third bailada in a row for Bruno
    playRound({ roundNumber: 3, cards: 1, bets: { ana: 1, bru: 1, car: 0 }, winners: ['ana'] })
    await tracker.flush()
    expect(unlockedBy('ana')).toContain('mao-de-ferro')
    expect(unlockedBy('bru')).toContain('pe-frio')
    expect(unlockedBy('bru')).not.toContain('mao-de-ferro')
  })

  it('reads the winning card out of the trick to award trunfo-magro', async () => {
    playRound({
      roundNumber: 2,
      cards: 2,
      trunfo: 'K-♠️',
      bets: { ana: 1, bru: 1, car: 0 },
      winners: [{ id: 'ana', card: '3-♠️' }, 'bru'],
    })
    await tracker.flush()
    expect(unlockedBy('ana')).toContain('trunfo-magro')
  })

  describe('a table with a bot seat at kickoff', () => {
    beforeEach(() => build(eveningClock, withBot))

    it('awards nothing to anyone, human or bot', async () => {
      // The same kamikaze round that unlocks for Ana at a human-only table.
      playRound({
        roundNumber: 6,
        cards: 6,
        bets: { ana: 5, bru: 1, 'bot-1': 0 },
        winners: ['ana', 'ana', 'ana', 'ana', 'ana', 'bru'],
      })
      endGame([
        { id: 'ana', name: 'Ana', totalPoints: 120 },
        { id: 'bru', name: 'Bruno', totalPoints: 80 },
        { id: 'bot-1', name: 'Botelho', isBot: true, totalPoints: 60 },
      ])
      await tracker.flush()

      expect(achievements.unlocks).toEqual([])
      expect(publisher.events).toEqual([])
    })

    it('does not move the career counters that career conquistas read', async () => {
      endGame([
        { id: 'ana', name: 'Ana', totalPoints: 120 },
        { id: 'bru', name: 'Bruno', totalPoints: 80 },
        { id: 'bot-1', name: 'Botelho', isBot: true, totalPoints: 60 },
      ])
      await tracker.flush()

      // Otherwise a player could farm veterano/campeao against bots and have
      // them pop the moment they sat at a real table.
      const ana = await stats.get('ana')
      expect(ana.gamesPlayed).toBe(0)
      expect(ana.wins).toBe(0)
      expect(ana.totalPoints).toBe(0)
      // no hosting credit for opening a table with bots in it either
      expect(ana.hosted).toBe(0)
      expect(await stats.headToHead('ana')).toEqual([])
    })
  })

  it('applies career stats at game end and awards the career conquistas', async () => {
    endGame([
      { id: 'ana', name: 'Ana', totalPoints: 120 },
      { id: 'bru', name: 'Bruno', totalPoints: 80 },
      { id: 'car', name: 'Carla', totalPoints: 60 },
    ])
    await tracker.flush()

    const ana = await stats.get('ana')
    expect(ana.gamesPlayed).toBe(1)
    expect(ana.wins).toBe(1)
    expect(ana.currentWinStreak).toBe(1)
    expect(ana.totalPoints).toBe(120)
    // registerGame credits the leader with hosting
    expect(ana.hosted).toBe(1)

    expect(unlockedBy('ana')).toContain('estreante')
    expect(unlockedBy('ana')).toContain('campeao')
    expect(unlockedBy('bru')).toContain('estreante')
    expect(unlockedBy('bru')).not.toContain('campeao')
  })

  it('records head-to-head against everyone at the table', async () => {
    endGame([
      { id: 'ana', name: 'Ana', totalPoints: 120 },
      { id: 'bru', name: 'Bruno', totalPoints: 80 },
      { id: 'car', name: 'Carla', totalPoints: 60 },
    ])
    await tracker.flush()

    const anaH2H = await stats.headToHead('ana')
    expect(anaH2H).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opponentId: 'bru', wins: 1, losses: 0 }),
        expect.objectContaining({ opponentId: 'car', wins: 1, losses: 0 }),
      ]),
    )
    expect(anaH2H).toHaveLength(2)

    const bruH2H = await stats.headToHead('bru')
    expect(bruH2H).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opponentId: 'ana', wins: 0, losses: 1 }),
        expect.objectContaining({ opponentId: 'car', wins: 1, losses: 0 }),
      ]),
    )
  })

  it('awards the late-night conquista from the injected clock', async () => {
    build(() => new Date('2026-03-10T03:30:00-03:00'))
    endGame([
      { id: 'ana', name: 'Ana', totalPoints: 120 },
      { id: 'bru', name: 'Bruno', totalPoints: 80 },
      { id: 'car', name: 'Carla', totalPoints: 60 },
    ])
    await tracker.flush()
    expect(unlockedBy('ana')).toContain('coruja')
    expect(unlockedBy('ana')).not.toContain('madrugador')
  })

  it('ignores its own unlock events so the tee cannot loop', () => {
    expect(() =>
      send({ type: 'achievement-unlocked', playerId: 'ana', achievementId: 'campeao', at: 1 }),
    ).not.toThrow()
    expect(publisher.events).toHaveLength(0)
  })
})
