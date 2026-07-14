import type { Card, PlayerInfo, RoundPlayer } from '@bridou/shared'
import type { RoundPlayerData } from './state'

/** A player's full state inside a round — includes their hand, so never leaks whole. */
export interface RoundPlayerState extends PlayerInfo {
  cards: Card[]
  bet: number | null
  made: number | null
  points: number | null
}

/** Serialize a round player, including their hand (persistence only). */
export const toRoundPlayerData = (player: RoundPlayerState): RoundPlayerData => ({
  id: player.id,
  name: player.name,
  ...(player.photoURL !== undefined && { photoURL: player.photoURL }),
  ...(player.isBot && { isBot: true }),
  cards: [...player.cards],
  bet: player.bet,
  made: player.made,
  points: player.points,
})

/** Rebuild a round player from persisted data. */
export const fromRoundPlayerData = (data: RoundPlayerData): RoundPlayerState => ({
  id: data.id,
  name: data.name,
  ...(data.photoURL !== undefined && { photoURL: data.photoURL }),
  ...(data.isBot && { isBot: true }),
  cards: [...data.cards],
  bet: data.bet,
  made: data.made,
  points: data.points,
})

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
