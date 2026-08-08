import {
  AWARDS,
  type AwardId,
  type GameRecap,
  type PlayerInfo,
  type RecapAward,
  type RecapRoundPoint,
  type RecapUnlock,
  type RoundPlayer,
  type ScoreboardEntry,
} from '@bridou/shared'
import type { StoredGameEvent } from './ports'

/**
 * Builds a Resenha from the persisted event log.
 *
 * Pure: events in, recap out. Everything the recap shows was already being
 * written by `GameHistoryRecorder` — this just reads it back and finds the
 * jokes. Because it derives from the log rather than live state, a resenha can
 * be rebuilt for any finished game, forever.
 */

/** How one player did in one round, replayed from the event stream. */
interface RoundLine {
  roundNumber: number
  bet: number
  made: number
  points: number
}

interface PlayerLog {
  info: PlayerInfo
  rounds: RoundLine[]
  bailadas: number
  bestExactStreak: number
  zeroBets: number
  /** Highest bet this player called and hit exactly. */
  bestMadeBet: number
  tricks: number
  bestRoundPoints: number
}

const pointsFor = (bet: number, made: number): number => (bet === made ? 10 + made : -1)

/**
 * What a seat actually scored in a round. `round-ended` carries the settled
 * table (baseado included), which is the only authority once the blunt can
 * move the number; logs recorded before it existed fall back to the bet.
 */
const scoredPoints = (
  settled: RoundPlayer[] | undefined,
  playerId: string,
  bet: number,
  made: number,
): number => settled?.find((p) => p.id === playerId)?.points ?? pointsFor(bet, made)

/**
 * Picks the single clear winner of a superlative. Ties and zero-signal cases
 * return nothing — a quiet game should hand out fewer awards, not invented ones.
 */
const uniqueLeader = <T>(
  rows: T[],
  value: (row: T) => number,
  minimum: number,
): { row: T; value: number } | null => {
  let best: { row: T; value: number } | null = null
  let tied = false
  for (const row of rows) {
    const score = value(row)
    if (!best || score > best.value) {
      best = { row, value: score }
      tied = false
    } else if (score === best.value) {
      tied = true
    }
  }
  if (!best || tied || best.value < minimum) return null
  return best
}

const award = (id: AwardId, log: PlayerLog, detail: string): RecapAward => ({
  id,
  label: AWARDS[id].label,
  icon: AWARDS[id].icon,
  playerId: log.info.id,
  playerName: log.info.name,
  detail,
})

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

export interface RecapInput {
  gameId: string
  events: StoredGameEvent[]
  startedAt: Date
  endedAt: Date
  ranked: boolean
}

export const buildRecap = (input: RecapInput): GameRecap | null => {
  const byPlayer = new Map<string, PlayerLog>()
  const order: string[] = []
  const progression: RecapRoundPoint[] = []
  const unlocks: RecapUnlock[] = []
  const totals = new Map<string, number>()
  let midGameOrder: string[] = []
  let finalScoreboard: ScoreboardEntry[] = []

  // per-round scratch
  let roundNumber = 0
  let bets = new Map<string, number>()
  let tricks = new Map<string, number>()

  const ensure = (info: PlayerInfo): PlayerLog => {
    const existing = byPlayer.get(info.id)
    if (existing) return existing
    const created: PlayerLog = {
      info: { ...info },
      rounds: [],
      bailadas: 0,
      bestExactStreak: 0,
      zeroBets: 0,
      bestMadeBet: 0,
      tricks: 0,
      bestRoundPoints: 0,
    }
    byPlayer.set(info.id, created)
    order.push(info.id)
    return created
  }

  for (const { payload } of input.events) {
    switch (payload.type) {
      case 'round-started':
        roundNumber = payload.round.currentRoundNumber
        bets = new Map()
        tricks = new Map()
        for (const player of payload.round.players) ensure(player)
        break

      case 'player-bet':
        bets.set(payload.playerId, payload.bet)
        break

      case 'turn-ended':
        tricks.set(payload.winnerId, (tricks.get(payload.winnerId) ?? 0) + 1)
        break

      case 'round-ended': {
        for (const id of order) {
          const log = byPlayer.get(id)
          if (!log) continue
          const bet = bets.get(id) ?? 0
          const made = tricks.get(id) ?? 0
          const points = scoredPoints(payload.players, id, bet, made)

          log.rounds.push({ roundNumber, bet, made, points })
          log.tricks += made
          if (bet === 0) log.zeroBets++
          if (bet === made) {
            if (bet > log.bestMadeBet) log.bestMadeBet = bet
          } else {
            log.bailadas++
          }
          if (points > log.bestRoundPoints) log.bestRoundPoints = points

          // recompute the running streak so it survives out-of-order replays
          let streak = 0
          let best = 0
          for (const line of log.rounds) {
            streak = line.bet === line.made ? streak + 1 : 0
            if (streak > best) best = streak
          }
          log.bestExactStreak = best

          totals.set(id, (totals.get(id) ?? 0) + points)
        }
        progression.push({ roundNumber, totals: Object.fromEntries(totals) })
        break
      }

      case 'scoreboard-shown':
        if (!midGameOrder.length) midGameOrder = payload.scoreboard.map((e) => e.id)
        break

      case 'game-ended':
        finalScoreboard = payload.scoreboard
        break

      case 'achievement-unlocked':
        unlocks.push({ playerId: payload.playerId, achievementId: payload.achievementId })
        break
    }
  }

  if (!finalScoreboard.length || !byPlayer.size) return null

  const ranked = [...finalScoreboard].sort((a, b) => b.totalPoints - a.totalPoints)
  const finalOrder = ranked.map((entry) => entry.id)
  // Bots play, but they don't win awards — the jokes are about people.
  const humans = [...byPlayer.values()].filter((log) => !log.info.isBot)

  const awards: RecapAward[] = []
  const push = (
    id: AwardId,
    leader: { row: PlayerLog; value: number } | null,
    detail: (value: number, log: PlayerLog) => string,
  ) => {
    if (leader) awards.push(award(id, leader.row, detail(leader.value, leader.row)))
  }

  push(id_('bailarino'), uniqueLeader(humans, (l) => l.bailadas, 1), (v) =>
    `bailou ${plural(v, 'vez', 'vezes')}`,
  )
  push(id_('maoDeFerro'), uniqueLeader(humans, (l) => l.bestExactStreak, 3), (v) =>
    `${v} apostas exatas seguidas`,
  )
  push(id_('cagao'), uniqueLeader(humans, (l) => l.zeroBets, 4), (v) =>
    `apostou zero ${plural(v, 'vez', 'vezes')}`,
  )
  push(id_('kamikaze'), uniqueLeader(humans, (l) => l.bestMadeBet, 4), (v) =>
    `apostou ${v} e fez ${v}`,
  )
  push(id_('pedreiro'), uniqueLeader(humans, (l) => l.tricks, 1), (v) =>
    `${plural(v, 'vaza', 'vazas')} na partida`,
  )
  push(id_('sortudo'), uniqueLeader(humans, (l) => l.bestRoundPoints, 14), (v) =>
    `${v} pontos numa rodada só`,
  )

  // Climbs are measured against the half-time scoreboard, which is the only
  // standing everyone actually saw mid-game.
  const climbOf = (log: PlayerLog): number => {
    const from = midGameOrder.indexOf(log.info.id)
    const to = finalOrder.indexOf(log.info.id)
    if (from < 0 || to < 0) return 0
    return from - to
  }
  push(id_('zebra'), uniqueLeader(humans, climbOf, 2), (v) =>
    `subiu ${plural(v, 'posição', 'posições')} desde a rodada 7`,
  )

  const [top, second] = ranked
  if (top && second) {
    const margin = top.totalPoints - second.totalPoints
    const champion = byPlayer.get(top.id)
    if (champion && !champion.info.isBot && margin >= 15) {
      awards.push(award('carrasco', champion, `venceu por ${margin} pontos`))
    }
  }

  const bestClimb = uniqueLeader(humans, climbOf, 1)

  return {
    gameId: input.gameId,
    playedAt: input.endedAt.toISOString(),
    durationMs: Math.max(0, input.endedAt.getTime() - input.startedAt.getTime()),
    players: order.flatMap((id) => {
      const log = byPlayer.get(id)
      return log ? [log.info] : []
    }),
    finalScoreboard: ranked,
    awards,
    progression,
    unlocks,
    biggestComeback: bestClimb
      ? {
          playerId: bestClimb.row.info.id,
          playerName: bestClimb.row.info.name,
          positions: bestClimb.value,
        }
      : null,
    ranked: input.ranked,
  }
}

/** Keeps the award ids honest against the shared catalog at compile time. */
const id_ = (id: AwardId): AwardId => id
