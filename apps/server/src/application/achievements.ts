import type { Card, DomainEvent, EventPublisher, PlayerInfo, ScoreboardEntry } from '@bridou/shared'
import {
  careerAchievements,
  gameAchievements,
  isRealPlayer,
  pointsFor,
  roundAchievements,
  type RoundOutcome,
} from './achievement-rules'
import type {
  AchievementRepository,
  PlayerGameOutcome,
  PlayerStatsRepository,
} from './ports'

/**
 * Awards conquistas by watching the domain-event stream.
 *
 * It hangs off the same tee as the history recorder, so the engine stays
 * completely unaware of it. Nothing here can affect play: every write is
 * async and failures are logged, never thrown into the game loop.
 *
 * Round-scoped conquistas fire the moment a round ends, which is the point —
 * the whole table sees "Bruno desbloqueou: MÃO DE FERRO" while it still means
 * something. Game and career ones land with the final scoreboard.
 *
 * Only bot-free tables count, on the same rule the ranking uses: a bot seat at
 * kickoff disqualifies the whole game, a mid-game takeover does not. Conquistas
 * are bragging material, and farming them against bots would make them
 * worthless — while losing them because someone's phone died would be worse.
 */

/** Per-player accumulator for the game in progress. */
interface PlayerProgress {
  info: PlayerInfo
  rounds: RoundOutcome[]
  exactStreak: number
  bailStreak: number
  bailadas: number
}

interface GameProgress {
  players: PlayerInfo[]
  byPlayer: Map<string, PlayerProgress>
  roundNumber: number
  cardsForEachPlayer: number
  trunfo: Card
  /** Bets placed this round, by player id. */
  bets: Map<string, number>
  /** Tricks won this round: winner id → the cards that won them. */
  winningCards: Map<string, Card[]>
  /** Player ids in round-7 scoreboard order, best first. */
  midGameOrder: string[]
}

export interface AchievementTrackerDeps {
  achievements: AchievementRepository
  stats: PlayerStatsRepository
  /** Injectable clock — the tracker is delivery-layer, so a real clock is fine. */
  now?: () => Date
  /** Timezone the "what are we doing awake" conquistas are judged in. */
  timeZone?: string
}

const hourIn = (at: Date, timeZone: string): number => {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(at)
  return Number(formatted)
}

export class AchievementTracker {
  private readonly games = new Map<string, GameProgress>()
  private readonly chains = new Map<string, Promise<void>>()
  private readonly now: () => Date
  private readonly timeZone: string
  /** Set by `bind` — the gateway doesn't exist yet when the tracker is built. */
  private publisherFor: ((gameId: string) => EventPublisher) | null = null

  constructor(private readonly deps: AchievementTrackerDeps) {
    this.now = deps.now ?? (() => new Date())
    this.timeZone = deps.timeZone ?? 'America/Sao_Paulo'
  }

  /** Late-wires the transport, mirroring how abandonment is bound in app.ts. */
  bind(deps: { publisherFor: (gameId: string) => EventPublisher }): void {
    this.publisherFor = deps.publisherFor
  }

  /** Called when a game starts, before any engine event. */
  registerGame(gameId: string, players: PlayerInfo[], leaderId: string): void {
    // A bot at kickoff disqualifies the table. Never registering the game is
    // the whole gate: `onDomainEvent` no-ops without an accumulator, so no
    // conquista is awarded and no career counter moves.
    if (!players.every(isRealPlayer)) return

    this.games.set(gameId, {
      players: players.map((p) => ({ ...p })),
      byPlayer: new Map(
        players.map((p) => [
          p.id,
          { info: { ...p }, rounds: [], exactStreak: 0, bailStreak: 0, bailadas: 0 },
        ]),
      ),
      roundNumber: 0,
      cardsForEachPlayer: 0,
      trunfo: '',
      bets: new Map(),
      winningCards: new Map(),
      midGameOrder: [],
    })

    // Every seat is human by the guard above, so the leader is too.
    if (players.some((p) => p.id === leaderId)) {
      this.enqueue(gameId, () => this.deps.stats.bumpHosted(leaderId))
    }
  }

  /** Fed every published domain event (same hook as history / abandonment). */
  onDomainEvent(gameId: string, event: DomainEvent): void {
    // Our own unlocks come back around through the tee — never re-process them.
    if (event.type === 'achievement-unlocked' || event.type === 'emote-sent') return

    const progress = this.games.get(gameId)
    if (!progress) return

    switch (event.type) {
      case 'round-started':
        progress.roundNumber = event.round.currentRoundNumber
        progress.cardsForEachPlayer = event.round.cardsForEachPlayer
        progress.trunfo = event.round.trunfo
        progress.bets.clear()
        progress.winningCards.clear()
        break

      case 'trunfo-set':
        progress.trunfo = event.trunfo
        break

      case 'player-bet':
        progress.bets.set(event.playerId, event.bet)
        break

      case 'turn-ended': {
        // TurnSnapshot.players is in play order and playedCards follows it,
        // so the winner's card sits at the winner's seat index.
        const seat = event.turn.players.findIndex((p) => p.id === event.winnerId)
        const card = seat >= 0 ? event.turn.playedCards[seat] : undefined
        if (card) {
          const won = progress.winningCards.get(event.winnerId) ?? []
          won.push(card)
          progress.winningCards.set(event.winnerId, won)
        }
        break
      }

      case 'round-ended':
        this.completeRound(gameId, progress)
        break

      case 'scoreboard-shown':
        // The mid-game scoreboard is the "who was losing at half time" record.
        if (!progress.midGameOrder.length) {
          progress.midGameOrder = event.scoreboard.map((entry) => entry.id)
        }
        break

      case 'game-ended':
        this.completeGame(gameId, progress, event.scoreboard)
        break
    }
  }

  /** Wait for queued writes to settle — tests and shutdown use this. */
  async flush(gameId?: string): Promise<void> {
    if (gameId) {
      await this.chains.get(gameId)
      return
    }
    await Promise.all([...this.chains.values()])
  }

  private completeRound(gameId: string, progress: GameProgress): void {
    for (const player of progress.players) {
      const state = progress.byPlayer.get(player.id)
      if (!state) continue

      const bet = progress.bets.get(player.id) ?? 0
      const winningCards = progress.winningCards.get(player.id) ?? []
      const made = winningCards.length
      const points = pointsFor(bet, made)
      const exact = bet === made

      state.rounds.push({
        roundNumber: progress.roundNumber,
        cardsForEachPlayer: progress.cardsForEachPlayer,
        bet,
        made,
        points,
      })
      state.exactStreak = exact ? state.exactStreak + 1 : 0
      state.bailStreak = exact ? 0 : state.bailStreak + 1
      if (!exact) state.bailadas++

      if (!isRealPlayer(player)) continue

      const earned = roundAchievements({
        roundNumber: progress.roundNumber,
        cardsForEachPlayer: progress.cardsForEachPlayer,
        bet,
        made,
        points,
        exactStreak: state.exactStreak,
        bailStreak: state.bailStreak,
        winningCards,
        trunfo: progress.trunfo,
      })
      if (earned.length) this.award(gameId, player.id, earned)
    }
  }

  private completeGame(
    gameId: string,
    progress: GameProgress,
    scoreboard: ScoreboardEntry[],
  ): void {
    const ranked = [...scoreboard].sort((a, b) => b.totalPoints - a.totalPoints)
    const standings = ranked.map((entry) => entry.totalPoints)
    const endedHour = hourIn(this.now(), this.timeZone)
    const humans = progress.players.filter(isRealPlayer)

    for (const player of humans) {
      const state = progress.byPlayer.get(player.id)
      if (!state) continue
      const rank = ranked.findIndex((entry) => entry.id === player.id) + 1
      if (!rank) continue

      const earned = gameAchievements({
        rounds: state.rounds,
        totalRounds: 13,
        bailadas: state.bailadas,
        playerCount: progress.players.length,
        rank,
        standings,
        midGameOrder: progress.midGameOrder,
        playerId: player.id,
        endedHour,
      })
      if (earned.length) this.award(gameId, player.id, earned)

      // Career totals, then the conquistas that read them. Sequenced through
      // the same chain so the counters are updated before the rules run.
      const outcome: PlayerGameOutcome = {
        playerId: player.id,
        rank,
        points: ranked[rank - 1]?.totalPoints ?? 0,
        bailadas: state.bailadas,
        beat: ranked.slice(rank).map((entry) => entry.id).filter((id) =>
          humans.some((h) => h.id === id),
        ),
        lostTo: ranked
          .slice(0, rank - 1)
          .map((entry) => entry.id)
          .filter((id) => humans.some((h) => h.id === id)),
      }

      this.enqueue(gameId, async () => {
        const totals = await this.deps.stats.applyGameResult(outcome)
        const [bestRivalryStreak, unlockedCount] = await Promise.all([
          this.deps.stats.bestRivalryStreak(player.id),
          this.deps.achievements.countFor(player.id),
        ])
        const careerEarned = careerAchievements({
          gamesPlayed: totals.gamesPlayed,
          wins: totals.wins,
          hosted: totals.hosted,
          currentWinStreak: totals.currentWinStreak,
          bestRivalryStreak,
          unlockedCount,
        })
        await this.persist(gameId, player.id, careerEarned)
      })
    }

    // The game is over; drop its accumulator once the queue drains.
    this.enqueue(gameId, async () => {
      this.games.delete(gameId)
    })
  }

  private award(gameId: string, playerId: string, achievementIds: string[]): void {
    this.enqueue(gameId, () => this.persist(gameId, playerId, achievementIds))
  }

  /** Unlocks each id and publishes only the ones that were genuinely new. */
  private async persist(
    gameId: string,
    playerId: string,
    achievementIds: string[],
  ): Promise<void> {
    for (const achievementId of achievementIds) {
      const isNew = await this.deps.achievements.unlock(playerId, achievementId, gameId)
      if (!isNew) continue
      this.publisherFor?.(gameId).publish({
        type: 'achievement-unlocked',
        playerId,
        achievementId,
        at: this.now().getTime(),
      })
    }
  }

  private enqueue(gameId: string, fn: () => Promise<void>): void {
    const prev = this.chains.get(gameId) ?? Promise.resolve()
    const next = prev.then(fn).catch((err) => {
      console.error('achievement persistence failed', err)
    })
    this.chains.set(gameId, next)
  }
}
