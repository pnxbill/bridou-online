import { GameError } from '@bridou/engine'
import type { PlayerInfo } from '@bridou/shared'
import { Router, type Request, type Response } from 'express'
import { ForbiddenError, NotFoundError } from '../application/errors'
import type { GameService } from '../application/game-service'
import type { TokenVerifier } from '../application/ports'
import { requireAuth, type AuthedRequest } from './auth'

const statusFor = (err: unknown): number => {
  if (err instanceof NotFoundError) return 404
  if (err instanceof ForbiddenError) return 403
  if (err instanceof GameError) return 400
  return 500
}

const respond = async (res: Response, fn: () => object | Promise<object>): Promise<void> => {
  try {
    res.status(200).json({ message: 'ok', ...(await fn()) })
  } catch (err) {
    const status = statusFor(err)
    if (status === 500) console.error(err)
    res.status(status).json({
      message: err instanceof Error && status !== 500 ? err.message : 'Internal server error',
    })
  }
}

/** Identity proven by the bearer token — the only PlayerInfo the API trusts. */
const player = (req: AuthedRequest): PlayerInfo => {
  if (!req.player) throw new Error('Route is missing the auth middleware')
  return req.player
}

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value) throw new GameError(`Missing ${name}`)
  return value
}

export const createRoutes = (service: GameService, verifier: TokenVerifier): Router => {
  const routes = Router()
  const auth = requireAuth(verifier)

  routes.post('/api/lobbies', auth, (req: Request, res: Response) => {
    respond(res, () => ({ lobby: service.createLobby(player(req)) }))
  })

  // Public on purpose: invite links let logged-out friends watch the lobby fill up.
  routes.get('/api/lobbies/:code', (req: Request, res: Response) => {
    respond(res, () => ({ lobby: service.lobbyState(requireString(req.params.code, 'code')) }))
  })

  routes.post('/api/lobbies/:code/join', auth, (req: Request, res: Response) => {
    respond(res, () => ({
      lobby: service.joinLobby(requireString(req.params.code, 'code'), player(req)),
    }))
  })

  routes.post('/api/lobbies/:code/leave', auth, (req: Request, res: Response) => {
    respond(res, () => ({
      lobby: service.leaveLobby(requireString(req.params.code, 'code'), player(req).id),
    }))
  })

  routes.post('/api/lobbies/:code/bots', auth, (req: Request, res: Response) => {
    respond(res, () => service.addBotToLobby(requireString(req.params.code, 'code'), player(req).id))
  })

  routes.post('/api/lobbies/:code/start', auth, (req: Request, res: Response) => {
    respond(res, () => ({
      gameId: service.startGame(requireString(req.params.code, 'code'), player(req).id).id,
    }))
  })

  routes.get('/api/current-game', auth, (req: Request, res: Response) => {
    respond(res, () => service.currentGame(player(req).id))
  })

  routes.post('/api/enter-game', auth, (req: Request, res: Response) => {
    respond(res, async () => ({
      game: await service.enterGame(requireString(req.body.gameId, 'gameId'), player(req).id),
    }))
  })

  routes.post('/api/bet', auth, (req: Request, res: Response) => {
    respond(res, () => {
      const bet = Number(req.body.bet)
      if (Number.isNaN(bet)) throw new GameError('Missing bet')
      service.placeBet(requireString(req.body.gameId, 'gameId'), player(req).id, bet)
      return {}
    })
  })

  routes.post('/api/play-card', auth, (req: Request, res: Response) => {
    respond(res, () => {
      service.playCard(
        requireString(req.body.gameId, 'gameId'),
        player(req).id,
        requireString(req.body.card, 'card'),
      )
      return {}
    })
  })

  routes.get('/api/close-score', auth, (req: Request, res: Response) => {
    respond(res, () => {
      service.closeScoreboard(requireString(req.query.gameId, 'gameId'))
      return {}
    })
  })

  return routes
}
