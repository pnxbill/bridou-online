import { GameError } from '@bridou/engine'
import type { PlayerInfo } from '@bridou/shared'
import { Router, type Request, type Response } from 'express'
import { ForbiddenError, NotFoundError } from '../application/errors'
import type { GameService } from '../application/game-service'

const statusFor = (err: unknown): number => {
  if (err instanceof NotFoundError) return 404
  if (err instanceof ForbiddenError) return 403
  if (err instanceof GameError) return 400
  return 500
}

const respond = (res: Response, fn: () => object): void => {
  try {
    res.status(200).json({ message: 'ok', ...fn() })
  } catch (err) {
    const status = statusFor(err)
    if (status === 500) console.error(err)
    res.status(status).json({
      message: err instanceof Error && status !== 500 ? err.message : 'Internal server error',
    })
  }
}

const parsePlayerInfo = (user: unknown): PlayerInfo => {
  const candidate = user as Partial<PlayerInfo> | undefined
  if (!candidate?.id || !candidate.name) throw new GameError('Invalid player')
  return {
    id: String(candidate.id),
    name: String(candidate.name),
    ...(candidate.photoURL ? { photoURL: String(candidate.photoURL) } : {}),
  }
}

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value) throw new GameError(`Missing ${name}`)
  return value
}

export const createRoutes = (service: GameService): Router => {
  const routes = Router()

  routes.post('/api/lobbies', (req: Request, res: Response) => {
    respond(res, () => ({ lobby: service.createLobby(parsePlayerInfo(req.body.user)) }))
  })

  routes.get('/api/lobbies/:code', (req: Request, res: Response) => {
    respond(res, () => ({ lobby: service.lobbyState(requireString(req.params.code, 'code')) }))
  })

  routes.post('/api/lobbies/:code/join', (req: Request, res: Response) => {
    respond(res, () => ({
      lobby: service.joinLobby(
        requireString(req.params.code, 'code'),
        parsePlayerInfo(req.body.user),
      ),
    }))
  })

  routes.post('/api/lobbies/:code/leave', (req: Request, res: Response) => {
    respond(res, () => ({
      lobby: service.leaveLobby(
        requireString(req.params.code, 'code'),
        requireString(req.body.playerId, 'playerId'),
      ),
    }))
  })

  routes.post('/api/lobbies/:code/bots', (req: Request, res: Response) => {
    respond(res, () =>
      service.addBotToLobby(
        requireString(req.params.code, 'code'),
        requireString(req.body.playerId, 'playerId'),
      ),
    )
  })

  routes.post('/api/lobbies/:code/start', (req: Request, res: Response) => {
    respond(res, () => ({
      gameId: service.startGame(
        requireString(req.params.code, 'code'),
        requireString(req.body.playerId, 'playerId'),
      ).id,
    }))
  })

  routes.get('/api/current-game', (req: Request, res: Response) => {
    respond(res, () => service.currentGame(requireString(req.query.playerId, 'playerId')))
  })

  routes.post('/api/enter-game', (req: Request, res: Response) => {
    respond(res, () => ({
      game: service.enterGame(
        requireString(req.body.gameId, 'gameId'),
        requireString(req.body.playerId, 'playerId'),
      ),
    }))
  })

  routes.post('/api/bet', (req: Request, res: Response) => {
    respond(res, () => {
      const bet = Number(req.body.bet)
      if (Number.isNaN(bet)) throw new GameError('Missing bet')
      service.placeBet(
        requireString(req.body.gameId, 'gameId'),
        requireString(req.body.playerId, 'playerId'),
        bet,
      )
      return {}
    })
  })

  routes.post('/api/play-card', (req: Request, res: Response) => {
    respond(res, () => {
      service.playCard(
        requireString(req.body.gameId, 'gameId'),
        requireString(req.body.playerId, 'playerId'),
        requireString(req.body.card, 'card'),
      )
      return {}
    })
  })

  routes.get('/api/close-score', (req: Request, res: Response) => {
    respond(res, () => {
      service.closeScoreboard(requireString(req.query.gameId, 'gameId'))
      return {}
    })
  })

  return routes
}
