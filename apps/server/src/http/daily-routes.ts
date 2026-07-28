import { dailyDateFor, type DailyLeaderboardRow, type DailyState } from '@bridou/shared'
import { GameError } from '@bridou/engine'
import { Router, type Request, type Response } from 'express'
import type { AuthedRequest } from './auth'
import { authFor, player, respond, type RouteDeps } from './routes'

/**
 * A Mão do Dia.
 *
 * Auth is required even to *see* the puzzle: the leaderboard is per-person and
 * the whole ritual is "did you beat the others in your mesa today", which needs
 * a name attached.
 */
export const createDailyRoutes = (deps: RouteDeps): Router => {
  const routes = Router()
  const auth = authFor(deps)
  const { daily, dailyAttempts, players } = deps

  const stateFor = async (playerId: string): Promise<DailyState> => {
    const date = dailyDateFor()
    const [attempt, rows, streak] = await Promise.all([
      dailyAttempts.attemptFor(date, playerId),
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

    return {
      puzzle: daily.puzzle(date),
      attempt: attempt
        ? {
            date: attempt.date,
            playerId: attempt.playerId,
            bet: attempt.bet,
            made: attempt.made,
            points: attempt.points,
            exact: attempt.bet === attempt.made,
            playedAt: attempt.playedAt.toISOString(),
          }
        : null,
      leaderboard,
      streak,
    }
  }

  routes.get('/api/daily', auth, (req: Request, res: Response) => {
    respond(res, async () => ({ daily: await stateFor(player(req as AuthedRequest).id) }))
  })

  routes.post('/api/daily', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const me = player(req as AuthedRequest)
      const bet = Number(req.body?.bet)
      if (!Number.isInteger(bet)) throw new GameError('Aposta inválida')

      const date = dailyDateFor()
      // Resolve BEFORE recording: an invalid bet must not burn the day's attempt.
      const { made, points } = daily.resolve(date, bet)

      await players.upsert(me)
      const recorded = await dailyAttempts.record({
        date,
        playerId: me.id,
        bet,
        made,
        points,
      })
      if (!recorded) throw new GameError('Você já jogou a mão de hoje')

      return { daily: await stateFor(me.id) }
    })
  })

  return routes
}
