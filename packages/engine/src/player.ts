import type { Card, PlayerInfo, RoundPlayer } from '@bridou/shared'

/** A player's full state inside a round — includes their hand, so never leaks whole. */
export interface RoundPlayerState extends PlayerInfo {
  cards: Card[]
  bet: number | null
  made: number | null
  points: number | null
}

/** The public view of a player: everything except their hand. */
export const toRoundPlayer = (player: RoundPlayerState): RoundPlayer => ({
  id: player.id,
  name: player.name,
  ...(player.photoURL !== undefined && { photoURL: player.photoURL }),
  ...(player.isBot && { isBot: true }),
  bet: player.bet,
  made: player.made,
  points: player.points,
})
