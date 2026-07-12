import type {
  GameSnapshot,
  LobbySnapshot,
  PlayerInfo,
  PlayerPerspective,
  SessionState,
  VoicePresence,
} from '@bridou/shared'
import { getServerUrl } from './config'

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

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${getServerUrl()}${path}`, {
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

const lobbyPath = (code: string, action = '') =>
  `/api/lobbies/${encodeURIComponent(code)}${action}`

export const api = {
  createLobby: (user: PlayerInfo) => post<{ lobby: LobbySnapshot }>('/api/lobbies', { user }),

  lobby: (code: string) => request<{ lobby: LobbySnapshot }>(lobbyPath(code)),

  joinLobby: (code: string, user: PlayerInfo) =>
    post<{ lobby: LobbySnapshot }>(lobbyPath(code, '/join'), { user }),

  leaveLobby: (code: string, playerId: string) =>
    post<{ lobby: LobbySnapshot }>(lobbyPath(code, '/leave'), { playerId }),

  addBot: (code: string, playerId: string) =>
    post<{ bot: PlayerInfo }>(lobbyPath(code, '/bots'), { playerId }),

  startGame: (code: string, playerId: string) =>
    post<{ gameId: string }>(lobbyPath(code, '/start'), { playerId }),

  currentGame: (playerId: string) =>
    request<{ gameId: string | null }>(
      `/api/current-game?playerId=${encodeURIComponent(playerId)}`,
    ),

  enterGame: (gameId: string, playerId: string) =>
    post<{ game: GameEntry }>('/api/enter-game', { gameId, playerId }),

  placeBet: (gameId: string, playerId: string, bet: number) =>
    post('/api/bet', { gameId, playerId, bet }),

  playCard: (gameId: string, playerId: string, card: string) =>
    post('/api/play-card', { gameId, playerId, card }),

  closeScore: (gameId: string) =>
    request(`/api/close-score?gameId=${encodeURIComponent(gameId)}`),

  voiceRoster: (gameId: string) =>
    request<{ participants: VoicePresence[] }>(
      `/api/games/${encodeURIComponent(gameId)}/voice`,
    ),
}
