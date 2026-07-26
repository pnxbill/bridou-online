import { ACHIEVEMENTS } from '@bridou/shared'
import { Router, type Request, type Response } from 'express'
import { requireAuth, type AuthedRequest } from './auth'
import { player, requireString, respond, type RouteDeps } from './routes'

/**
 * Conquistas and career stats.
 *
 * Profiles are public on purpose — a conquista is bragging material, and a
 * link that only works when you're logged in doesn't get pasted into the
 * group chat.
 */
export const createAchievementRoutes = (deps: RouteDeps): Router => {
  const routes = Router()
  const auth = requireAuth(deps.verifier)

  /** The whole catalog, so the client can render locked entries too. */
  routes.get('/api/achievements', (_req: Request, res: Response) => {
    respond(res, async () => ({ achievements: ACHIEVEMENTS }))
  })

  routes.get('/api/players/:playerId/profile', (req: Request, res: Response) => {
    respond(res, async () => {
      const playerId = requireString(req.params.playerId, 'playerId')
      const [unlocked, stats, headToHead] = await Promise.all([
        deps.achievements.listFor(playerId),
        deps.playerStats.get(playerId),
        deps.playerStats.headToHead(playerId),
      ])
      return { unlocked, stats, headToHead }
    })
  })

  /** Convenience alias so the client doesn't have to know its own uid. */
  routes.get('/api/me/profile', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const me = player(req as AuthedRequest).id
      const [unlocked, stats, headToHead] = await Promise.all([
        deps.achievements.listFor(me),
        deps.playerStats.get(me),
        deps.playerStats.headToHead(me),
      ])
      return { unlocked, stats, headToHead }
    })
  })

  return routes
}
