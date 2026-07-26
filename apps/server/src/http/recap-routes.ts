import { Router, type Request, type Response } from 'express'
import { NotFoundError } from '../application/errors'
import { buildRecap } from '../application/recap'
import { requireString, respond, type RouteDeps } from './routes'

/**
 * Resenhas.
 *
 * Public on purpose: the whole point is that the link survives being pasted
 * into the group chat, where half the readers aren't signed in and one of them
 * is going to be the person the awards are making fun of.
 */
export const createRecapRoutes = (deps: RouteDeps): Router => {
  const routes = Router()

  routes.get('/api/games/:gameId/recap', (req: Request, res: Response) => {
    respond(res, async () => {
      const gameId = requireString(req.params.gameId, 'gameId')
      const summary = await deps.history.getGame(gameId)
      if (!summary) throw new NotFoundError('Partida não encontrada')
      if (summary.status !== 'finished' || !summary.endedAt) {
        throw new NotFoundError('Essa partida ainda não acabou')
      }

      const events = await deps.history.getGameEvents(gameId)
      const recap = buildRecap({
        gameId,
        events,
        startedAt: summary.startedAt,
        endedAt: summary.endedAt,
        ranked: summary.ranked,
      })
      if (!recap) throw new NotFoundError('Sem resenha pra essa partida')
      return { recap }
    })
  })

  return routes
}
