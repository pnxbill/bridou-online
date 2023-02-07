export type TNumOfCards = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type TNumOfBet = 0 | TNumOfCards
export type TNumOfRounds = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
export type TNumOfPlayers = 4 | 5 | 6 | 7
export type TCards = string[]
export interface TPlayer {
  id: string
  name: string
  cards?: TCards
  points?: number
  bet?: TNumOfBet
  made?: TNumOfBet
  totalPoints?: number
  socket: string
  photoURL?: string
}
export interface TRound {
  players: TPlayer[]
  cardsForEachPlayer: TNumOfCards
  numOfPlayers: TNumOfPlayers
  trunfo: string
  cards: TCards
  numOfCards: number
  playedCards: any[][]
  currentRoundNumber: TNumOfRounds
}

export interface TTurn {
  gameId: string
  players: TPlayer[]
  suit: string
  playedCards: string[]
  trunfo: string
}
