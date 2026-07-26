import { describe, expect, it } from 'vitest'
import {
  careerAchievements,
  gameAchievements,
  isRealPlayer,
  pointsFor,
  roundAchievements,
  type CareerContext,
  type GameContext,
  type RoundContext,
} from '../src/application/achievement-rules'

const round = (over: Partial<RoundContext> = {}): RoundContext => ({
  roundNumber: 3,
  cardsForEachPlayer: 3,
  bet: 1,
  made: 1,
  points: 11,
  exactStreak: 1,
  bailStreak: 0,
  winningCards: [],
  trunfo: 'K-♠️',
  ...over,
})

const game = (over: Partial<GameContext> = {}): GameContext => ({
  rounds: [],
  totalRounds: 13,
  bailadas: 3,
  playerCount: 4,
  rank: 2,
  standings: [100, 90, 80, 70],
  midGameOrder: ['a', 'b', 'c', 'd'],
  playerId: 'a',
  endedHour: 21,
  ...over,
})

const career = (over: Partial<CareerContext> = {}): CareerContext => ({
  gamesPlayed: 1,
  wins: 0,
  hosted: 0,
  currentWinStreak: 0,
  bestRivalryStreak: 0,
  unlockedCount: 0,
  ...over,
})

/** Rounds that all hit their bet — the shape "sem susto" needs. */
const perfectRounds = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    roundNumber: i + 1,
    cardsForEachPlayer: 1,
    bet: 1,
    made: 1,
    points: 11,
  }))

describe('pointsFor', () => {
  it('mirrors the engine: exact bet scores 10 + tricks, a miss is -1', () => {
    expect(pointsFor(3, 3)).toBe(13)
    expect(pointsFor(0, 0)).toBe(10)
    expect(pointsFor(2, 1)).toBe(-1)
  })
})

describe('roundAchievements', () => {
  it('awards profeta only for a perfect 7 on round 7', () => {
    expect(roundAchievements(round({ roundNumber: 7, cardsForEachPlayer: 7, bet: 7, made: 7 })))
      .toContain('profeta')
    expect(roundAchievements(round({ roundNumber: 7, cardsForEachPlayer: 7, bet: 6, made: 6 })))
      .not.toContain('profeta')
    // right bet, wrong round
    expect(roundAchievements(round({ roundNumber: 6, cardsForEachPlayer: 7, bet: 7, made: 7 })))
      .not.toContain('profeta')
  })

  it('awards cego-sortudo for hitting the bet on the blind round', () => {
    expect(roundAchievements(round({ roundNumber: 13, cardsForEachPlayer: 1, bet: 1, made: 1 })))
      .toContain('cego-sortudo')
    expect(roundAchievements(round({ roundNumber: 13, cardsForEachPlayer: 1, bet: 1, made: 0 })))
      .not.toContain('cego-sortudo')
  })

  it('awards varrida for sweeping a round of 4+ cards, bet or no bet', () => {
    expect(roundAchievements(round({ cardsForEachPlayer: 4, bet: 2, made: 4 })))
      .toContain('varrida')
    // a sweep of a 3-card round is too common to be worth anything
    expect(roundAchievements(round({ cardsForEachPlayer: 3, bet: 3, made: 3 })))
      .not.toContain('varrida')
  })

  it('awards kamikaze for a big bet that lands', () => {
    expect(roundAchievements(round({ cardsForEachPlayer: 6, bet: 5, made: 5 })))
      .toContain('kamikaze')
    expect(roundAchievements(round({ cardsForEachPlayer: 6, bet: 5, made: 4 })))
      .not.toContain('kamikaze')
  })

  it('awards so-observando for a clean zero on a big round', () => {
    expect(roundAchievements(round({ cardsForEachPlayer: 5, bet: 0, made: 0 })))
      .toContain('so-observando')
    expect(roundAchievements(round({ cardsForEachPlayer: 4, bet: 0, made: 0 })))
      .not.toContain('so-observando')
  })

  it('awards both streak tiers once the longer streak is reached', () => {
    const five = roundAchievements(round({ exactStreak: 5 }))
    expect(five).toContain('sequencia-limpa')
    expect(five).toContain('mao-de-ferro')

    const three = roundAchievements(round({ exactStreak: 3 }))
    expect(three).toContain('mao-de-ferro')
    expect(three).not.toContain('sequencia-limpa')
  })

  it('awards the bailada streaks', () => {
    expect(roundAchievements(round({ bailStreak: 3 }))).toContain('pe-frio')
    expect(roundAchievements(round({ bailStreak: 3 }))).not.toContain('bailador-nato')
    expect(roundAchievements(round({ bailStreak: 4 }))).toContain('bailador-nato')
  })

  it('awards trunfo-magro only for a low card of the trump suit', () => {
    expect(roundAchievements(round({ trunfo: 'K-♠️', winningCards: ['3-♠️'] })))
      .toContain('trunfo-magro')
    // high trump: impressive, but not a theft
    expect(roundAchievements(round({ trunfo: 'K-♠️', winningCards: ['Q-♠️'] })))
      .not.toContain('trunfo-magro')
    // low card, wrong suit
    expect(roundAchievements(round({ trunfo: 'K-♠️', winningCards: ['3-♥️'] })))
      .not.toContain('trunfo-magro')
  })
})

describe('gameAchievements', () => {
  it('awards sem-susto only for all 13 rounds exact', () => {
    expect(gameAchievements(game({ rounds: perfectRounds(13) }))).toContain('sem-susto')
    expect(gameAchievements(game({ rounds: perfectRounds(12) }))).not.toContain('sem-susto')
  })

  it('awards invicto for a complete game with no bailadas', () => {
    expect(gameAchievements(game({ rounds: perfectRounds(13), bailadas: 0 })))
      .toContain('invicto')
    expect(gameAchievements(game({ rounds: perfectRounds(13), bailadas: 1 })))
      .not.toContain('invicto')
  })

  it('awards a-virada for last at half time and first at the end', () => {
    const ctx = { rank: 1, playerId: 'd', midGameOrder: ['a', 'b', 'c', 'd'] }
    expect(gameAchievements(game(ctx))).toContain('a-virada')
    // won, but was already leading at half time
    expect(gameAchievements(game({ ...ctx, playerId: 'a' }))).not.toContain('a-virada')
  })

  it('awards margin conquistas to the winner only', () => {
    expect(gameAchievements(game({ rank: 1, standings: [91, 90] }))).toContain('fotochegada')
    expect(gameAchievements(game({ rank: 1, standings: [130, 90] }))).toContain('carrasco')
    // same margin, but second place earns nothing
    expect(gameAchievements(game({ rank: 2, standings: [130, 90] }))).not.toContain('carrasco')
  })

  it('awards mesa-cheia and lanterna from the table shape', () => {
    expect(gameAchievements(game({ playerCount: 7 }))).toContain('mesa-cheia')
    expect(gameAchievements(game({ playerCount: 4, rank: 4 }))).toContain('lanterna')
    expect(gameAchievements(game({ playerCount: 4, rank: 3 }))).not.toContain('lanterna')
  })

  it('awards cagao for six or more zero bets', () => {
    const zeroBets = (count: number) =>
      Array.from({ length: 13 }, (_, i) => ({
        roundNumber: i + 1,
        cardsForEachPlayer: 2,
        bet: i < count ? 0 : 1,
        made: i < count ? 0 : 1,
        points: 10,
      }))
    expect(gameAchievements(game({ rounds: zeroBets(6) }))).toContain('cagao')
    expect(gameAchievements(game({ rounds: zeroBets(5) }))).not.toContain('cagao')
  })

  it('splits the late-night conquistas by hour, never both', () => {
    expect(gameAchievements(game({ endedHour: 3 }))).toContain('coruja')
    expect(gameAchievements(game({ endedHour: 3 }))).not.toContain('madrugador')
    expect(gameAchievements(game({ endedHour: 6 }))).toContain('madrugador')
    expect(gameAchievements(game({ endedHour: 21 }))).not.toContain('coruja')
  })
})

describe('careerAchievements', () => {
  it('awards the games-played ladder cumulatively', () => {
    expect(careerAchievements(career({ gamesPlayed: 1 }))).toEqual(['estreante'])
    const veteran = careerAchievements(career({ gamesPlayed: 25 }))
    expect(veteran).toContain('estreante')
    expect(veteran).toContain('veterano')
    expect(veteran).not.toContain('lenda-da-mesa')
    expect(careerAchievements(career({ gamesPlayed: 100 }))).toContain('lenda-da-mesa')
  })

  it('awards the win streak ladder', () => {
    expect(careerAchievements(career({ wins: 1, currentWinStreak: 1 }))).toContain('campeao')
    const three = careerAchievements(career({ wins: 3, currentWinStreak: 3 }))
    expect(three).toContain('bicampeao')
    expect(three).toContain('tricampeao')
  })

  it('awards anfitriao, nemesis and colecionador from their own counters', () => {
    expect(careerAchievements(career({ hosted: 25 }))).toContain('anfitriao')
    expect(careerAchievements(career({ bestRivalryStreak: 5 }))).toContain('nemesis')
    expect(careerAchievements(career({ unlockedCount: 15 }))).toContain('colecionador')
    expect(careerAchievements(career({ unlockedCount: 14 }))).not.toContain('colecionador')
  })
})

describe('isRealPlayer', () => {
  it('rejects bot seats however they are flagged', () => {
    expect(isRealPlayer({ id: 'uid-1' })).toBe(true)
    expect(isRealPlayer({ id: 'uid-1', isBot: true })).toBe(false)
    expect(isRealPlayer({ id: 'bot-abc' })).toBe(false)
  })
})
