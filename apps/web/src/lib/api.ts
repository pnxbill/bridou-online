import type {
  DailyState,
  DomainEvent,
  GameRecap,
  GameSnapshot,
  HeadToHead,
  LobbySnapshot,
  MesaDetail,
  MesaSummary,
  PlayerPerspective,
  RankingEntry,
  SessionState,
  UnlockedAchievement,
  VoicePresence,
} from '@bridou/shared'
import { getServerUrl } from './config'
import { getIdToken } from './firebase'

/** What `/api/enter-game` returns: the shared snapshot plus the caller's private view. */
export type GameEntry = GameSnapshot &
  PlayerPerspective &
  SessionState & {
    time: number
    /** Set while the table paused itself on purpose (not an abandonment). */
    pausedBy?: string | null
  }

/**
 * The Mão do Dia endpoints all answer the same way: where the table is, plus
 * the events that got it there so the client can play them out rather than
 * cut straight to the result.
 */
export interface DailyResponse {
  daily: DailyState
  events: DomainEvent[]
}

/** Lifetime counters as the profile endpoints return them. */
export interface CareerStats {
  playerId: string
  gamesPlayed: number
  wins: number
  hosted: number
  currentWinStreak: number
  bestWinStreak: number
  totalPoints: number
  bailadas: number
}

export interface PlayerProfile {
  unlocked: UnlockedAchievement[]
  stats: CareerStats
  headToHead: HeadToHead[]
}

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

  sendEmote: (gameId: string, emoteId: string) => post('/api/emote', { gameId, emoteId }),

  /** Hands the baseado to the next seat. Only its holder may. */
  passBaseado: (gameId: string) => post('/api/pass-baseado', { gameId }),

  /** Deliberate pause — no timer, ends only when a human resumes. */
  pauseGame: (gameId: string) => post('/api/pause', { gameId }),

  resumeGame: (gameId: string) => post('/api/resume', { gameId }),

  closeScore: (gameId: string) =>
    request(`/api/close-score?gameId=${encodeURIComponent(gameId)}`),

  rankings: () => request<{ rankings: RankingEntry[] }>('/api/rankings'),

  /** Conquistas + career stats + head-to-head for the signed-in player. */
  myProfile: () => request<PlayerProfile>('/api/me/profile'),

  playerProfile: (playerId: string) =>
    request<PlayerProfile>(`/api/players/${encodeURIComponent(playerId)}/profile`),

  /** Post-game resenha, rebuilt from the event log. Public — links get shared. */
  recap: (gameId: string) =>
    request<{ recap: GameRecap }>(`/api/games/${encodeURIComponent(gameId)}/recap`),

  /* ── mesas ────────────────────────────────────────────────────────────── */

  createMesa: (name: string) => post<{ mesa: MesaSummary }>('/api/mesas', { name }),

  myMesas: () => request<{ mesas: MesaSummary[] }>('/api/mesas'),

  /** Public: an invite link shows the standings before you sign in. */
  mesa: (code: string) =>
    request<{ mesa: MesaDetail }>(`/api/mesas/${encodeURIComponent(code)}`),

  joinMesa: (code: string) =>
    post<{ mesa: MesaSummary }>(`/api/mesas/${encodeURIComponent(code)}/join`, {}),

  leaveMesa: (code: string) => post(`/api/mesas/${encodeURIComponent(code)}/leave`, {}),

  /** Opens a lobby bound to this mesa — its result lands in the season. */
  openMesaTable: (code: string) =>
    post<{ lobby: LobbySnapshot }>(`/api/mesas/${encodeURIComponent(code)}/open`, {}),

  /* ── mão do dia ───────────────────────────────────────────────────────── */

  /**
   * The day's table. `events` is what the client hasn't watched yet — a page
   * load gets none (the snapshot already holds it), a bet or a play gets
   * everything the table did in reply, to be animated in order.
   */
  daily: () => request<DailyResponse>('/api/daily'),

  /** Calls the day's bet. Final the moment it lands — one hand per day. */
  dailyBet: (bet: number) => post<DailyResponse>('/api/daily/bet', { bet }),

  dailyPlay: (card: string) => post<DailyResponse>('/api/daily/play', { card }),

  voiceRoster: (gameId: string) =>
    request<{ participants: VoicePresence[] }>(
      `/api/games/${encodeURIComponent(gameId)}/voice`,
    ),
}
