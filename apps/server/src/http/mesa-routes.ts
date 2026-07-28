import { Router, type Request, type Response } from 'express'
import { NotFoundError } from '../application/errors'
import type { AuthedRequest } from './auth'
import { authFor, player, requireString, respond, type RouteDeps } from './routes'

/**
 * Mesas — the persistent group, its season, and opening a table from it.
 *
 * Reading a mesa is public so an invite link shows the standings before you've
 * signed in (that's what makes someone want to join); every write is authed and
 * membership-checked.
 */
export const createMesaRoutes = (deps: RouteDeps): Router => {
  const routes = Router()
  const auth = authFor(deps)
  const { mesas, service, presence } = deps

  routes.post('/api/mesas', auth, (req: Request, res: Response) => {
    respond(res, async () => ({
      mesa: await mesas.create(String(req.body?.name ?? ''), player(req as AuthedRequest)),
    }))
  })

  routes.get('/api/mesas', auth, (req: Request, res: Response) => {
    respond(res, async () => ({
      mesas: await mesas.listForPlayer(player(req as AuthedRequest).id),
    }))
  })

  routes.get('/api/mesas/:code', (req: Request, res: Response) => {
    respond(res, async () => ({
      mesa: await mesas.detail(requireString(req.params.code, 'code'), presence.onlinePlayerIds()),
    }))
  })

  routes.post('/api/mesas/:code/join', auth, (req: Request, res: Response) => {
    respond(res, async () => ({
      mesa: await mesas.join(requireString(req.params.code, 'code'), player(req as AuthedRequest)),
    }))
  })

  routes.post('/api/mesas/:code/leave', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const mesa = await mesas.byCode(requireString(req.params.code, 'code'))
      if (!mesa) throw new NotFoundError('Mesa não encontrada')
      await mesas.leave(mesa.id, player(req as AuthedRequest).id)
      return {}
    })
  })

  /**
   * Opens a lobby for this mesa. The lobby carries the mesa id, so when the
   * game ends its result lands in the mesa's current season.
   */
  routes.post('/api/mesas/:code/open', auth, (req: Request, res: Response) => {
    respond(res, async () => {
      const me = player(req as AuthedRequest)
      const mesa = await mesas.byCode(requireString(req.params.code, 'code'))
      if (!mesa) throw new NotFoundError('Mesa não encontrada')
      await mesas.assertMember(mesa.id, me.id)
      return { lobby: service.createLobby(me, mesa.id) }
    })
  })

  return routes
}
