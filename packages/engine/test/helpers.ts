import type { DomainEvent, DomainEventType, EventPublisher, PlayerInfo } from '@bridou/shared'
import type { BotStrategy } from '../src/bot'
import type { Game } from '../src/game'
import type { RoundPlayerState } from '../src/player'
import type { Rng, Scheduler } from '../src/ports'

export class RecordingPublisher implements EventPublisher {
  events: DomainEvent[] = []

  publish(event: DomainEvent): void {
    this.events.push(event)
  }

  ofType<T extends DomainEventType>(type: T): Extract<DomainEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type)
  }

  last<T extends DomainEventType>(type: T): Extract<DomainEvent, { type: T }> | undefined {
    return this.ofType(type).at(-1)
  }
}

/** Scheduler that only runs when told to — makes round transitions deterministic. */
export class ManualScheduler implements Scheduler {
  pending: { fn: () => void; delayMs: number }[] = []

  schedule(fn: () => void, delayMs: number): void {
    this.pending.push({ fn, delayMs })
  }

  /** Run everything scheduled so far (not what those callbacks schedule). */
  flush(): void {
    const batch = this.pending
    this.pending = []
    batch.forEach(({ fn }) => fn())
  }
}

/** mulberry32 — tiny deterministic PRNG for reproducible shuffles. */
export const seededRng = (seed: number): Rng => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const makePlayers = (count: number): PlayerInfo[] =>
  Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }))

export const makeRoundPlayer = (id: string, cards: string[]): RoundPlayerState => ({
  id,
  name: id,
  cards: [...cards],
  bet: null,
  made: null,
  points: null,
})

/** Anything bots can act on — a Game or a single Round. */
type Actor = Pick<Game, 'placeBet' | 'playCard'>

/** Strategies per seat; seats without one answer pseudo-randomly. */
export interface DriverOptions {
  strategies?: Record<string, BotStrategy>
}

/**
 * Bot driver: consumes bet/play requests from the event log and answers with
 * a legal move — via the seat's strategy when given one, else picked
 * pseudo-randomly so games vary by seed — until the engine stops asking.
 */
export const drivePendingRequests = (
  game: Actor,
  publisher: RecordingPublisher,
  rng: Rng,
  cursor = { index: 0 },
  options: DriverOptions = {},
): void => {
  let guard = 10_000
  while (cursor.index < publisher.events.length) {
    if (--guard === 0) throw new Error('Bot driver seems stuck in a loop')
    const event = publisher.events[cursor.index++]!
    const strategy = options.strategies?.[
      'playerId' in event ? (event.playerId as string) : ''
    ]

    if (event.type === 'bet-requested') {
      const bet = strategy
        ? strategy.decideBet({
            playerId: event.playerId,
            snapshot: (game as Game).snapshot(),
            hand: (game as Game).perspective(event.playerId).playableCards.map((c) => c.value),
            availableBets: event.availableBets,
          })
        : event.availableBets[Math.floor(rng() * event.availableBets.length)]!
      game.placeBet(event.playerId, bet)
    } else if (event.type === 'play-requested') {
      const card = strategy
        ? strategy.decideCard({
            playerId: event.playerId,
            snapshot: (game as Game).snapshot(),
            playableCards: event.cards,
          })
        : event.cards.filter((c) => !c.disabled)[
            Math.floor(rng() * event.cards.filter((c) => !c.disabled).length)
          ]!.value
      game.playCard(event.playerId, card)
    }
  }
}

/** Plays an entire game to the end with bots, flushing round transitions. */
export const playFullGame = (
  game: Game,
  publisher: RecordingPublisher,
  scheduler: ManualScheduler,
  rng: Rng,
  options: DriverOptions = {},
): void => {
  const cursor = { index: 0 }
  game.start()
  let guard = 100
  while (true) {
    if (--guard === 0) throw new Error('Game never finished')
    drivePendingRequests(game, publisher, rng, cursor, options)
    if (!scheduler.pending.length) return
    scheduler.flush()
  }
}
