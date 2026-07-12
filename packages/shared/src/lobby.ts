import type { PlayerInfo } from './game'

/**
 * Public state of a pre-game lobby, sent whole on every `lobby-updated`
 * event so clients never have to stitch incremental joins/leaves together.
 */
export interface LobbySnapshot {
  /** Becomes the game id when the leader starts — the realtime room carries over. */
  lobbyId: string
  /** Short shareable join code (uppercase, ambiguity-free alphabet). */
  code: string
  leaderId: string
  players: PlayerInfo[]
}
