import { Game, createHeuristicBot, createSeededRng, type Scheduler } from '@bridou/engine'
import {
  DAILY_CARDS,
  DAILY_PLAYERS,
  dailyPoints,
  dailySeed,
  type DailyDate,
  type DailyHandPuzzle,
  type PlayerInfo,
} from '@bridou/shared'

/**
 * A Mão do Dia — one hand, the same deal for everyone, once a day.
 *
 * This is the app's answer to a Tuesday when nobody else is online: 30 seconds,
 * a deal everyone in your mesa also faced, and a number worth arguing about in
 * the group chat.
 *
 * Everything here is derived from the date alone. The deal comes from a seeded
 * RNG and the three opponents use the heuristic bot, which contains no
 * randomness at all — so a given (date, bet) pair always produces the same
 * result, on any server, forever. No puzzle state is stored; only the answer.
 *
 * The player chooses the *bet* and the hand is then played out for them. That
 * is deliberately the whole game: "what is this hand actually worth" is the
 * judgement Bridou lives on, and it fits in the time someone has on a bus.
 */

/** The daily table's opponents. Fixed names so the leaderboard reads the same for all. */
const DAILY_BOTS: PlayerInfo[] = [
  { id: 'daily-bot-1', name: 'Botelho', isBot: true },
  { id: 'daily-bot-2', name: 'Robertinho', isBot: true },
  { id: 'daily-bot-3', name: 'Bot Marley', isBot: true },
]

/** The human always sits at seat 0 so they bet first and lead the first trick. */
export const DAILY_HUMAN_SEAT = 'daily-you'

/** Queues the engine's timed steps instead of running them, so we drive the clock. */
class QueuedScheduler implements Scheduler {
  private readonly pending: Array<() => void> = []

  schedule(fn: () => void): void {
    this.pending.push(fn)
  }

  /** Runs the next queued step. @returns whether there was one. */
  runNext(): boolean {
    const next = this.pending.shift()
    if (!next) return false
    next()
    return true
  }
}

const buildGame = (date: DailyDate): { game: Game; scheduler: QueuedScheduler } => {
  const scheduler = new QueuedScheduler()
  const players: PlayerInfo[] = [{ id: DAILY_HUMAN_SEAT, name: 'Você' }, ...DAILY_BOTS]
  const game = new Game(
    { id: `daily-${date}`, leaderId: DAILY_HUMAN_SEAT, players },
    {
      publisher: { publish: () => {} },
      scheduler,
      rng: createSeededRng(dailySeed(date)),
    },
  )
  // Round N deals N cards; the daily hand is a five-card round.
  game.currentRoundNumber = DAILY_CARDS
  game.start()
  return { game, scheduler }
}

export class DailyHandService {
  /** The day's deal, as the player sees it before betting. */
  puzzle(date: DailyDate): DailyHandPuzzle {
    const { game } = buildGame(date)
    const round = game.currentRound
    const seat = round.players.find((p) => p.id === DAILY_HUMAN_SEAT)

    return {
      date,
      trunfo: round.trunfo,
      hand: [...(seat?.cards ?? [])],
      seats: game.players.map((p) => ({ ...p })),
      availableBets: round.getAvailableBets(DAILY_HUMAN_SEAT),
    }
  }

  /**
   * Plays the day's hand out with the player's bet in place.
   *
   * The bet is not cosmetic: the seat is played by a bot reading the public
   * snapshot, and that snapshot includes what you called — so calling three
   * genuinely makes your cards get played for three.
   */
  resolve(date: DailyDate, bet: number): { made: number; points: number } {
    const { game, scheduler } = buildGame(date)
    const round = game.currentRound

    if (!round.getAvailableBets(DAILY_HUMAN_SEAT).includes(bet)) {
      throw new Error(`Bet ${bet} is not available for ${date}`)
    }

    const bot = createHeuristicBot()

    // Betting goes round the table in seat order, the human first.
    while (round.betting) {
      const playerId = round.currentPlayer.id
      const chosen =
        playerId === DAILY_HUMAN_SEAT
          ? bet
          : bot.decideBet({
              playerId,
              snapshot: game.snapshot(),
              hand: [...(round.players.find((p) => p.id === playerId)?.cards ?? [])],
              availableBets: round.getAvailableBets(playerId),
            })
      game.placeBet(playerId, chosen)
    }

    // Then every trick. When a trick completes the engine queues the next one
    // on the scheduler rather than starting it inline, so we run that step.
    const maxSteps = DAILY_CARDS * DAILY_PLAYERS * 3
    for (let step = 0; step < maxSteps && !round.isComplete; step++) {
      const turn = round.currentTurn
      if (!turn || turn.isComplete) {
        if (!scheduler.runNext()) break
        continue
      }
      const playerId = turn.currentPlayer.id
      game.playCard(
        playerId,
        bot.decideCard({
          playerId,
          snapshot: game.snapshot(),
          playableCards: round.getPlayableCards(playerId),
        }),
      )
    }

    const made = round.whoMade.filter((p) => p.id === DAILY_HUMAN_SEAT).length
    return { made, points: dailyPoints(bet, made) }
  }
}
