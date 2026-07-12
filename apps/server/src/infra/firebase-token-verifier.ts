import type { PlayerInfo } from '@bridou/shared'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { TokenVerifier } from '../application/ports'

/**
 * Google publishes the keys that sign Firebase ID tokens here; jose caches
 * them and refetches on rotation, so no service-account credential is needed
 * just to VERIFY tokens (that's why this isn't firebase-admin).
 */
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

/**
 * Verifies Firebase ID tokens per the official checklist: RS256 signature,
 * issuer/audience bound to the project, unexpired, non-empty subject.
 */
export class FirebaseTokenVerifier implements TokenVerifier {
  private readonly jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL))

  constructor(private readonly projectId: string) {}

  async verify(token: string): Promise<PlayerInfo | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
        algorithms: ['RS256'],
      })
      if (typeof payload.sub !== 'string' || !payload.sub) return null
      return {
        id: payload.sub,
        name: typeof payload.name === 'string' && payload.name ? payload.name : 'Jogador',
        ...(typeof payload.picture === 'string' && payload.picture
          ? { photoURL: payload.picture }
          : {}),
      }
    } catch {
      return null
    }
  }
}
