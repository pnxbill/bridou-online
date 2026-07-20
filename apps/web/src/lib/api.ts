import type {
  GameSnapshot,
  LobbySnapshot,
  PlayerPerspective,
  RankingEntry,
  SessionState,
  VoicePresence,
} from '@bridou/shared'
import { getServerUrl } from './config'
import { getIdToken } from './firebase'

/** What `/api/enter-game` returns: the shared snapshot plus the caller's private view. */
export type GameEntry = GameSnapshot & PlayerPerspective & SessionState & { time: number }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Every call carries the Firebase ID token; the server derives WHO from it,
 * which is why no method here takes a playerId or user object anymore.
 */
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = await getIdToken()
  const res = await fetch(`${getServerUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.message ?? 'Erro inesperado', res.status)
  return data as T
}

const post = <T>(path: string, body: object) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

const lobbyPath = (code: string, action = '') =>
  `/api/lobbies/${encodeURIComponent(code)}${action}`

export const api = {
  createLobby: () => post<{ lobby: LobbySnapshot }>('/api/lobbies', {}),

  lobby: (code: string) => request<{ lobby: LobbySnapshot }>(lobbyPath(code)),

  joinLobby: (code: string) => post<{ lobby: LobbySnapshot }>(lobbyPath(code, '/join'), {}),

  leaveLobby: (code: string) => post<{ lobby: LobbySnapshot }>(lobbyPath(code, '/leave'), {}),

  addBot: (code: string) => post<{ bot: unknown }>(lobbyPath(code, '/bots'), {}),

  startGame: (code: string) => post<{ gameId: string }>(lobbyPath(code, '/start'), {}),

  currentGame: () => request<{ gameId: string | null }>('/api/current-game'),

  enterGame: (gameId: string) => post<{ game: GameEntry }>('/api/enter-game', { gameId }),

  placeBet: (gameId: string, bet: number) => post('/api/bet', { gameId, bet }),

  playCard: (gameId: string, card: string) => post('/api/play-card', { gameId, card }),

  closeScore: (gameId: string) =>
    request(`/api/close-score?gameId=${encodeURIComponent(gameId)}`),

  rankings: () => request<{ rankings: RankingEntry[] }>('/api/rankings'),

  voiceRoster: (gameId: string) =>
    request<{ participants: VoicePresence[] }>(
      `/api/games/${encodeURIComponent(gameId)}/voice`,
    ),
}
