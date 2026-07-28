import {
  Game,
  GameError,
  createHeuristicBot,
  createSeededRng,
  type Scheduler,
} from '@bridou/engine'
import {
  DAILY_CARDS,
  DAILY_PLAYERS,
  dailyPoints,
  dailySeed,
  isPrivateEvent,
  type Card,
  type DailyDate,
  type DailyTable,
  type DomainEvent,
  type PlayerInfo,
} from '@bridou/shared'

/**
 * A Mão do Dia — one hand, the same deal for everyone, once a day.
 *
 * This is the app's answer to a Tuesday when nobody else is online: a hand
 * everyone in your mesa also faced, and a number worth arguing about in the
 * group chat.
 *
 * ## The hand is a pure function of what you did
 *
 * Nothing about a daily hand in progress is stored as *state*. The deal comes
 * from a seeded RNG keyed on the date, and the three opponents use the
 * heuristic bot, which contains no randomness at all — so the whole table is
 * determined by `(date, bet, plays)`, where `plays` is just the list of cards
 * you have played so far. Every request replays the hand from the deal.
 *
 * That buys a lot for very little: the attempt survives a restart and follows
 * you between devices (it is three columns in one row), a play can't be
 * forged because the server re-derives the legal moves before accepting it,
 * and there is no session to expire halfway through a hand.
 *
 * ## It publishes real events
 *
 * The replay drives the real `Game` through its real public API, so it emits
 * the same `DomainEvent`s a live table does. Those events are what the client
 * animates — the daily is not a simulation of a game screen, it is the game
 * screen fed from a replay instead of a socket. Private events are filtered by
 * the same `isPrivateEvent` rule the gateway uses, so a bot's hand never
 * reaches the wire.
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

/** A bad decision from the client — a 400, not a server fault. */
export class DailyError extends GameError {}

/** Replays between yields during the par search — ~10ms of work at a time. */
const PAR_NODES_PER_TICK = 40

export interface DailyReplay extends DailyTable {
  /** Human-visible events for the whole hand so far, oldest first. */
  events: DomainEvent[]
  /**
   * Index into `events` where the consequences of the player's most recent
   * action begin. The routes slice here so the client animates only what it
   * hasn't seen — everything before it is already on its table.
   */
  sinceLastAction: number
  /** Tricks the player has taken so far. */
  made: number
  /** One entry per completed trick, `true` where the player took it. */
  trickWins: boolean[]
  /** Cards the player may legally play right now (empty unless it's their turn). */
  legalNow: Card[]
}

export class DailyHandService {
  /** Par is a full game-tree search; a day's answer never changes, so keep it. */
  private readonly parCache = new Map<DailyDate, number>()

  /**
   * Replays the day's hand with the player's decisions in place.
   *
   * Stops as soon as it needs a decision the player hasn't made — an unplaced
   * bet, or a trick waiting on their card — which is exactly the state the
   * table should be showing them.
   *
   * @throws DailyError if a stored decision is not legal (only reachable if a
   *   client forged one, since accepted plays are validated before storage).
   */
  replay(date: DailyDate, bet: number | null, plays: readonly Card[]): DailyReplay {
    const scheduler = new QueuedScheduler()
    const events: DomainEvent[] = []
    const publisher = {
      publish: (event: DomainEvent) => {
        // Same routing rule as the gateway: a private event belongs to one
        // seat, and three of these seats are bots.
        if (!isPrivateEvent(event) || event.playerId === DAILY_HUMAN_SEAT) events.push(event)
      },
    }

    const players: PlayerInfo[] = [{ id: DAILY_HUMAN_SEAT, name: 'Você' }, ...DAILY_BOTS]
    const game = new Game(
      { id: `daily-${date}`, leaderId: DAILY_HUMAN_SEAT, players },
      { publisher, scheduler, rng: createSeededRng(dailySeed(date)) },
    )
    // Round N deals N cards; the daily hand is a five-card round.
    game.currentRoundNumber = DAILY_CARDS
    game.start()

    const round = game.currentRound
    const bot = createHeuristicBot()
    /** Where the player's latest action starts; the whole log until one happens. */
    let sinceLastAction = -1

    while (round.betting) {
      const seat = round.currentPlayer.id
      if (seat === DAILY_HUMAN_SEAT) {
        if (bet === null) break // waiting on the player
        if (!round.getAvailableBets(DAILY_HUMAN_SEAT).includes(bet)) {
          throw new DailyError('Aposta inválida')
        }
        sinceLastAction = events.length
        game.placeBet(seat, bet)
        continue
      }
      game.placeBet(
        seat,
        bot.decideBet({
          playerId: seat,
          snapshot: game.snapshot(),
          hand: [...(round.players.find((p) => p.id === seat)?.cards ?? [])],
          availableBets: round.getAvailableBets(seat),
        }),
      )
    }

    // Then every trick. A completed trick queues the next one on the scheduler
    // rather than starting it inline, so we run that step ourselves.
    let played = 0
    const maxSteps = DAILY_CARDS * DAILY_PLAYERS * 3
    for (let step = 0; step < maxSteps && !round.betting && !round.isComplete; step++) {
      const turn = round.currentTurn
      if (!turn || turn.isComplete) {
        if (!scheduler.runNext()) break
        continue
      }
      const seat = turn.currentPlayer.id
      if (seat === DAILY_HUMAN_SEAT) {
        const card = plays[played]
        if (card === undefined) break // waiting on the player
        played++
        sinceLastAction = events.length
        try {
          game.playCard(seat, card)
        } catch {
          throw new DailyError('Essa carta não pode ser jogada agora')
        }
        continue
      }
      game.playCard(
        seat,
        bot.decideCard({
          playerId: seat,
          snapshot: game.snapshot(),
          playableCards: round.getPlayableCards(seat),
        }),
      )
    }

    if (played < plays.length) throw new DailyError('Essa carta não pode ser jogada agora')

    return {
      snapshot: game.snapshot(),
      ...game.clientPerspective(DAILY_HUMAN_SEAT),
      betting: round.betting,
      complete: round.isComplete,
      events,
      sinceLastAction: sinceLastAction === -1 ? events.length : sinceLastAction,
      made: round.whoMade.filter((p) => p.id === DAILY_HUMAN_SEAT).length,
      trickWins: round.whoMade.map((p) => p.id === DAILY_HUMAN_SEAT),
      legalNow: round.isComplete
        ? []
        : round
            .getPlayableCards(DAILY_HUMAN_SEAT)
            .filter((c) => !c.disabled)
            .map((c) => c.value),
    }
  }

  /**
   * The most points today's deal can yield, over every bet and every legal line.
   *
   * Meaningful precisely because the opponents are deterministic: this is the
   * real ceiling against the exact three bots everyone faced, not an average
   * over hypothetical ones. It's what turns "you scored 12" into "you scored 12
   * of a possible 15", which is the difference between a result and a puzzle.
   *
   * Exhaustive: at most 5! lines per bet, and the answer for a date never
   * changes, so it's computed once per server per day.
   *
   * It is async purely to stay off the event loop's back — a full search is
   * a few hundred milliseconds of straight-line work, which is an eternity for
   * a process that is also dealing live tables, so it yields as it goes.
   */
  async par(date: DailyDate): Promise<number> {
    const cached = this.parCache.get(date)
    if (cached !== undefined) return cached

    let best = -Infinity
    let sinceYield = 0
    for (let bet = 0; bet <= DAILY_CARDS; bet++) {
      // Depth-first over the player's own choices; the bots' replies come out
      // of the replay, so each node is one full re-deal of the hand.
      const frontier: Card[][] = [[]]
      while (frontier.length) {
        const prefix = frontier.pop()!
        let state: DailyReplay
        try {
          state = this.replay(date, bet, prefix)
        } catch {
          break // this bet isn't legal today
        }
        if (state.complete) {
          best = Math.max(best, dailyPoints(bet, state.made))
        } else {
          for (const card of state.legalNow) frontier.push([...prefix, card])
        }
        if (++sinceYield >= PAR_NODES_PER_TICK) {
          sinceYield = 0
          await new Promise((resolve) => setImmediate(resolve))
        }
      }
    }

    // Only ever unreachable if no bet was legal, which the rules can't produce.
    const par = Number.isFinite(best) ? best : dailyPoints(0, 0)
    this.parCache.set(date, par)
    // A day or two of answers is all anyone can be looking at.
    if (this.parCache.size > 4) this.parCache.delete(this.parCache.keys().next().value!)
    return par
  }
}
