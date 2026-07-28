import type { PlayerInfo } from '@bridou/shared'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { TokenVerifier } from '../application/ports'

/** Request with the identity proven by the bearer token (set by requireAuth). */
export interface AuthedRequest extends Request {
  player?: PlayerInfo
}

export const bearerToken = (req: Request): string | null => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length) || null
}

/**
 * Rejects the request with 401 unless it carries a valid Firebase ID token.
 * Handlers behind this middleware read the caller's identity from
 * `req.player` — never from the request body or query string.
 *
 * `onSeen` fires for every verified caller, which is how the mesa's "quem tá
 * on" ledger stays warm without a dedicated heartbeat endpoint.
 */
export const requireAuth =
  (verifier: TokenVerifier, onSeen?: (playerId: string) => void): RequestHandler =>
  (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const token = bearerToken(req)
    const verification = token ? verifier.verify(token) : Promise.resolve(null)
    verification
      .then((player) => {
        if (!player) {
          res.status(401).json({ message: 'Unauthorized' })
          return
        }
        req.player = player
        onSeen?.(player.id)
        next()
      })
      .catch(next)
  }
