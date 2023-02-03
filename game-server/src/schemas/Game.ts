import { Schema, model, Document } from 'mongoose'
import UserSchema, { UserType } from './User'

export type NumberOfCards = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type NumberOfRounds = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export interface GameType extends Document {
  playerCount: number
  players: UserType[]
  cards: NumberOfCards
  round: NumberOfRounds
}

const GameSchema = new Schema({
  playerCount: { type: String, required: true },
  players: [UserSchema],
  cards: { type: Number, required: true, min: 1, max: 7 },
  round: { type: Number, required: true, min: 1, max: 13 }
}, {
  timestamps: true
})

export default model<GameType>('Game', GameSchema)
