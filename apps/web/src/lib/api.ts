import type { GameSnapshot, PlayerInfo, PlayerPerspective } from '@bridou/shared'
import { SERVER_URL } from './config'

/** What `/api/enter-game` returns: the shared snapshot plus the caller's private view. */
export type GameEntry = GameSnapshot & PlayerPerspective & { time: number }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.message ?? 'Erro inesperado', res.status)
  return data as T
}

const post = <T>(path: string, body: object) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  queue: () =>
    request<{ queueId: string; leaderId?: string; queue: PlayerInfo[] }>('/api/queue'),

  enterQueue: (user: PlayerInfo) =>
    post<{ queueId: string; leaderId: string }>('/api/enter-queue', { user }),

  startGame: () => request<{ gameId: string }>('/api/start-game'),

  enterGame: (gameId: string, playerId: string) =>
    post<{ game: GameEntry }>('/api/enter-game', { gameId, playerId }),

  placeBet: (gameId: string, playerId: string, bet: number) =>
    post('/api/bet', { gameId, playerId, bet }),

  playCard: (gameId: string, playerId: string, card: string) =>
    post('/api/play-card', { gameId, playerId, card }),

  closeScore: (gameId: string) =>
    request(`/api/close-score?gameId=${encodeURIComponent(gameId)}`),
}
