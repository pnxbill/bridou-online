import type { TokenVerifier } from '../src/application/ports'

export const tokenFor = (playerId: string): string => `test:${playerId}`

/** E2e stand-in for Firebase: accepts `test:<uid>` tokens, rejects the rest. */
export const fakeTokenVerifier: TokenVerifier = {
  verify: async (token) => {
    if (!token.startsWith('test:')) return null
    const id = token.slice('test:'.length)
    return id ? { id, name: id } : null
  },
}
