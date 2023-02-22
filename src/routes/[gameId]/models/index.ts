import { TCard } from "~/components/hand"
import { TTurn } from "../../../../game-server/src/types"
import { TGame } from "../../../../types"

export interface TRound {
  trunfo: string
  players: TGame['currentRound']['players']
  bailadores?: TGame['currentRound']['bailadores']
  playedCards: string[]
  numOfCards: TGame['currentRound']['cardsForEachPlayer']
  whoMade?: TGame['currentRound']['whoMade']
  turns: Omit<TTurn, "playCard">[]
  currentTurn?: Omit<TTurn, "playCard">
  cards: TCard[]
  betAvailable: number[]
}