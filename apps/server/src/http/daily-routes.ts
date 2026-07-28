import {
  dailyDateFor,
  dailyPoints,
  type DailyDate,
  type DailyLeaderboardRow,
  type DailyState,
  type DomainEvent,
} from '@bridou/shared'
import { GameError } from '@bridou/engine'
import { Router, type Request, type Response } from 'express'
import { DailyError, type DailyReplay } from '../application/daily-hand'
import type { DailyAttemptRow } from '../application/ports'
import type { AuthedRequest } from './auth'
import { authFor, player, respond, requireString, type RouteDeps } from './routes'

/**
 * A Mão do Dia.
 *
 * The hand is *played*, not just bet on: `POST /bet` opens the attempt and
 * `POST /play` lands one card at a time. Neither endpoint keeps a session —
 * the stored bet and list of plays replay the whole table (see
 * `DailyHandService`), which is also what makes each play verifiable: the
 * server derives the legal cards before accepting one.
 *
 * Both mutating routes answer with the new table *and* the events that got it
 * there, so the client can animate the bots' replies instead of blinking to
 * the outcome.
 *
 * Auth is required even to *see* the puzzle: the leaderboard is per-person and
 * the whole ritual is "did you beat the others in your mesa today", which needs
 * a name attached.
 */
export const createDailyRoutes = (deps: RouteDeps): Router => {
  const routes = Router()
  const auth = authFor(deps)
  const { daily, dailyAttempts, players } = deps

  /** The whole day for one player: their table, their score, everyone's board. */
  const stateFor = async (
    playerId: string,
    date: DailyDate,
    attempt: DailyAttemptRow | null,
  ): Promise<{ state: DailyState; replay: DailyReplay }> => {
    const replay = daily.replay(date, attempt?.bet ?? null, attempt?.plays ?? [])

    const [rows, streak] = await Promise.all([
      dailyAttempts.leaderboard(date),
      dailyAttempts.streak(playerId, date),
    ])
    const infos = await players.getMany(rows.map((r) => r.playerId))
    const infoById = new Map(infos.map((i) => [i.id, i]))
    const leaderboard: DailyLeaderboardRow[] = rows.map((row, i) => {
      const info = infoById.get(row.playerId)
      return {
        id: row.playerId,
        name: info?.name ?? 'Jogador',
        ...(info?.photoURL ? { photoURL: info.photoURL } : {}),
        bet: row.bet,
        made: row.made,
        points: row.points,
        exact: row.bet === row.made,
        position: i + 1,
      }
    })

    const { events: _events, sinceLastAction: _since, legalNow: _legal, ...table } = replay
    return {
      replay,
      state: {
        date,
        table,
        result:
          attempt && attempt.finished
            ? {
                bet: attempt.bet,
                made: attempt.made,
                points: attempt.points,
                exact: attempt.bet === attempt.made,
                trickWins: replay.trickWins,
                // Only worth knowing once you can't act on it.
                par: await daily.par(date),
                finishedAt: (attempt.finishedAt ?? attempt.playedAt).toISOString(),
              }
            : null,
        leaderboard,
        streak,
      },
    }
  }

  /** Everything the player hasn't watched yet — what the client animates. */
  const newEvents = (replay: { events: DomainEvent[]; sinceLastAction: number }): DomainEvent[] =>
    replay.events.slice(replay.sinceLastAction)

  routes.get('/api/daily', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const me = player(req as AuthedRequest)
      const date = dailyDateFor()
      const attempt = await dailyAttempts.attemptFor(date, me.id)
      const { state } = await stateFor(me.id, date, attempt)
      // A page load renders the table from the snapshot; there is nothing to
      // replay because nothing happened while the player was watching.
      return { daily: state, events: [] }
    })
  })

  routes.post('/api/daily/bet', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const me = player(req as AuthedRequest)
      const bet = Number(req.body?.bet)
      if (!Number.isInteger(bet)) throw new GameError('Aposta inválida')

      const date = dailyDateFor()
      // Validate against a replay BEFORE recording: a bad bet must not burn the
      // day's attempt.
      daily.replay(date, bet, [])

      await players.upsert(me)
      const opened = await dailyAttempts.start({ date, playerId: me.id, bet })
      if (!opened) throw new GameError('Você já apostou na mão de hoje')

      const attempt = await dailyAttempts.attemptFor(date, me.id)
      const { state, replay } = await stateFor(me.id, date, attempt)
      return { daily: state, events: newEvents(replay) }
    })
  })

  routes.post('/api/daily/play', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const me = player(req as AuthedRequest)
      const card = requireString(req.body?.card, 'card')
      const date = dailyDateFor()

      const attempt = await dailyAttempts.attemptFor(date, me.id)
      if (!attempt) throw new GameError('Faça sua aposta primeiro')
      if (attempt.finished) throw new GameError('Você já jogou a mão de hoje')

      // A card is only ever in the hand once, so seeing it already played
      // means this request is a repeat — a double tap, or a retry after a
      // timeout. Answer with the table rather than an error the player would
      // have to make sense of.
      const settledAlready = attempt.plays.includes(card)
      if (settledAlready) {
        const { state } = await stateFor(me.id, date, attempt)
        return { daily: state, events: [] }
      }

      const before = daily.replay(date, attempt.bet, attempt.plays)
      if (!before.legalNow.includes(card)) {
        throw new DailyError('Essa carta não pode ser jogada agora')
      }

      const landed = await dailyAttempts.appendPlay(date, me.id, card, attempt.plays.length)
      // Two instances raced for the same trick and the other one won. Nothing
      // is lost — answer with where the table actually is.
      if (!landed) {
        const current = await dailyAttempts.attemptFor(date, me.id)
        const { state } = await stateFor(me.id, date, current)
        return { daily: state, events: [] }
      }

      const plays = [...attempt.plays, card]
      const after = daily.replay(date, attempt.bet, plays)
      if (after.complete) {
        await dailyAttempts.finish(date, me.id, after.made, dailyPoints(attempt.bet, after.made))
      }

      const settled = await dailyAttempts.attemptFor(date, me.id)
      const { state } = await stateFor(me.id, date, settled)
      return { daily: state, events: newEvents(after) }
    })
  })

  return routes
}
