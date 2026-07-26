import { GameError } from '@bridou/engine'
import type { PlayerInfo } from '@bridou/shared'
import { Router, type Request, type RequestHandler, type Response } from 'express'
import { ForbiddenError, NotFoundError } from '../application/errors'
import type { GameService } from '../application/game-service'
import type { DailyHandService } from '../application/daily-hand'
import type { MesaService } from '../application/mesa'
import type { OnlineTracker } from '../application/online'
import type {
  AchievementRepository,
  DailyRepository,
  GameHistoryRepository,
  PlayerRepository,
  PlayerStatsRepository,
  TokenVerifier,
} from '../application/ports'
import { requireAuth, type AuthedRequest } from './auth'
import { createAchievementRoutes } from './achievement-routes'
import { createDailyRoutes } from './daily-routes'
import { createMesaRoutes } from './mesa-routes'
import { createRecapRoutes } from './recap-routes'

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

/**
 * Everything the HTTP layer needs. An object rather than positional args
 * because the surface keeps growing (conquistas, resenhas, mesas, mão do dia)
 * and each feature mounts its own router.
 */
export interface RouteDeps {
  service: GameService
  verifier: TokenVerifier
  history: GameHistoryRepository
  achievements: AchievementRepository
  playerStats: PlayerStatsRepository
  mesas: MesaService
  /** Last-seen ledger behind the mesa's "quem tá on". */
  presence: OnlineTracker
  daily: DailyHandService
  dailyAttempts: DailyRepository
  players: PlayerRepository
}

/**
 * The auth middleware every router should use — it verifies the token AND
 * marks the caller as online, so building it by hand anywhere would silently
 * stop feeding the mesa presence ledger.
 */
export const authFor = (deps: RouteDeps): RequestHandler =>
  requireAuth(deps.verifier, (playerId) => deps.presence.touch(playerId))

export const createRoutes = (deps: RouteDeps): Router => {
  const { service, history } = deps
  const routes = Router()
  const auth = authFor(deps)

  // Public on purpose: the leaderboard is the game's shop window.
  routes.get('/api/rankings', (_req: Request, res: Response) => {
    respond(res, async () => ({ rankings: await history.getLeaderboard() }))
  })

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

  routes.post('/api/emote', auth, (req: Request, res: Response) => {
    respond(res, () => {
      service.sendEmote(
        requireString(req.body.gameId, 'gameId'),
        player(req).id,
        requireString(req.body.emoteId, 'emoteId'),
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

  routes.use(createAchievementRoutes(deps))
  routes.use(createRecapRoutes(deps))
  routes.use(createMesaRoutes(deps))
  routes.use(createDailyRoutes(deps))

  return routes
}

/** Shared by the feature routers so error mapping stays identical everywhere. */
export { respond, requireString, player }
