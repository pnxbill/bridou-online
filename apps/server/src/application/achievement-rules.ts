import { cardSuit, isBlindRound, rankValue, type Card } from '@bridou/shared'

/**
 * The rules that decide which conquistas a player earned.
 *
 * Deliberately pure: every function takes a plain context and returns ids, so
 * the whole catalog is unit-testable without a database, a clock or a game.
 * The tracker in `achievements.ts` is the only thing that knows about I/O.
 */

/** How one player finished one round. Points mirror the engine's own scoring. */
export interface RoundOutcome {
  roundNumber: number
  cardsForEachPlayer: number
  bet: number
  made: number
  points: number
}

export const pointsFor = (bet: number, made: number): number => (bet === made ? 10 + made : -1)

export interface RoundContext extends RoundOutcome {
  /** Consecutive exact bets including this round. */
  exactStreak: number
  /** Consecutive bailadas including this round. */
  bailStreak: number
  /** Tricks this player won this round, with the card that won them. */
  winningCards: Card[]
  trunfo: Card
}

/** Conquistas decidable the moment a round ends — these get announced live. */
export const roundAchievements = (ctx: RoundContext): string[] => {
  const earned: string[] = []
  const exact = ctx.bet === ctx.made

  if (ctx.roundNumber === 7 && ctx.bet === 7 && exact) earned.push('profeta')
  if (isBlindRound(ctx.roundNumber) && exact) earned.push('cego-sortudo')
  if (ctx.cardsForEachPlayer >= 4 && ctx.made === ctx.cardsForEachPlayer) earned.push('varrida')
  if (ctx.bet >= 5 && exact) earned.push('kamikaze')
  if (ctx.cardsForEachPlayer >= 5 && ctx.bet === 0 && exact) earned.push('so-observando')

  if (ctx.exactStreak >= 5) earned.push('sequencia-limpa')
  if (ctx.exactStreak >= 3) earned.push('mao-de-ferro')
  if (ctx.bailStreak >= 4) earned.push('bailador-nato')
  if (ctx.bailStreak >= 3) earned.push('pe-frio')

  // A small trump beating the whole table is the most satisfying play in the
  // game and leaves no trace on the scoreboard — so it gets its own conquista.
  const trunfoSuit = cardSuit(ctx.trunfo)
  if (
    ctx.winningCards.some((card) => cardSuit(card) === trunfoSuit && rankValue(card) <= 5)
  ) {
    earned.push('trunfo-magro')
  }

  return earned
}

export interface GameContext {
  rounds: RoundOutcome[]
  totalRounds: number
  bailadas: number
  playerCount: number
  /** 1-based finishing position. */
  rank: number
  /** Final totals across the table, best first. */
  standings: number[]
  /** Player ids in mid-game (round 7) scoreboard order, best first. */
  midGameOrder: string[]
  playerId: string
  /** Local hour (0-23) the game ended at, in the players' timezone. */
  endedHour: number
}

/** Conquistas that need the whole finished game. */
export const gameAchievements = (ctx: GameContext): string[] => {
  const earned: string[] = []
  const complete = ctx.rounds.length === ctx.totalRounds
  const won = ctx.rank === 1
  const [top, second] = ctx.standings

  if (complete && ctx.rounds.every((r) => r.bet === r.made)) earned.push('sem-susto')
  if (complete && ctx.bailadas === 0) earned.push('invicto')
  if (won && ctx.midGameOrder.at(-1) === ctx.playerId && ctx.midGameOrder.length > 1) {
    earned.push('a-virada')
  }
  if (won && top !== undefined && second !== undefined) {
    const margin = top - second
    if (margin === 1) earned.push('fotochegada')
    if (margin >= 30) earned.push('carrasco')
  }
  if (ctx.playerCount === 7) earned.push('mesa-cheia')
  if (ctx.rounds.filter((r) => r.bet === 0).length >= 6) earned.push('cagao')
  if (ctx.playerCount > 1 && ctx.rank === ctx.playerCount) earned.push('lanterna')

  // The "what are we still doing awake" pair.
  if (ctx.endedHour >= 2 && ctx.endedHour < 5) earned.push('coruja')
  if (ctx.endedHour >= 5 && ctx.endedHour < 8) earned.push('madrugador')

  return earned
}

export interface CareerContext {
  gamesPlayed: number
  wins: number
  hosted: number
  currentWinStreak: number
  /** Longest current run of finishing ahead of any single opponent. */
  bestRivalryStreak: number
  /** Conquistas already unlocked, before this game's batch is counted. */
  unlockedCount: number
}

/** Conquistas that read lifetime totals rather than a single game. */
export const careerAchievements = (ctx: CareerContext): string[] => {
  const earned: string[] = []

  if (ctx.gamesPlayed >= 1) earned.push('estreante')
  if (ctx.gamesPlayed >= 25) earned.push('veterano')
  if (ctx.gamesPlayed >= 100) earned.push('lenda-da-mesa')
  if (ctx.wins >= 1) earned.push('campeao')
  if (ctx.currentWinStreak >= 2) earned.push('bicampeao')
  if (ctx.currentWinStreak >= 3) earned.push('tricampeao')
  if (ctx.hosted >= 25) earned.push('anfitriao')
  if (ctx.bestRivalryStreak >= 5) earned.push('nemesis')
  if (ctx.unlockedCount >= 15) earned.push('colecionador')

  return earned
}

/** Bots never collect conquistas — seats, not people. */
export const isRealPlayer = (player: { id: string; isBot?: boolean }): boolean =>
  !player.isBot && !player.id.startsWith('bot-')
