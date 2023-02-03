import { TPlayer } from '../types'
import fs from 'fs'
import readline from 'readline'
import GameController from '../controllers/GameController'

class Utils {
  static cardValues = {
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  } as const

  static sortPlayers(players: TPlayer[]) {
    players.sort((a, b) => {
      if (a.totalPoints > b.totalPoints) {
        return -1
      }
      if (a.totalPoints < b.totalPoints) {
        return 1
      }
      return 0
    })
    return players
  }

  static getCardValue(card) {
    return isNaN(Number(card)) ? this.cardValues[card] : Number(card)
  }

  static flip(data) {
    return Object.fromEntries(Object
      .entries(data)
      .map(([key, value]) => [value, key])
    )
  }

  static getCardName(card: number) {
    return card > 10 ? this.flip(this.cardValues)[card] : String(card)
  }

  static async processLineByLine(socketInstance: any, socketId: string, playerId: string, gameId: string) {
    const fileStream = fs.createReadStream('game.txt')

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.
    let isCard = false
    let i = GameController.games[gameId].numOfPlayers as number
    for await (const line of rl) {
      // Each line in input.txt will be successively available here as `line`.
      if (line.includes('[CARDS]')) {
        isCard = true
        socketInstance.to(socketId).emit('log', line)
        continue
      }
      if (isCard) {
        const playerIndex = GameController.games[gameId].players.findIndex(p => p.id === playerId)
        const playerCards = GameController.games[gameId].currentRound.players[playerIndex].cards?.join(', ')
        if (playerCards === line) {
          socketInstance.to(socketId).emit('log', line)
        }
        i = i - 1
        if (i === 0) {
          isCard = false
          i = GameController.games[gameId].numOfPlayers as number
        }
        continue
      }
      socketInstance.to(socketId).emit('log', line)
    }
  }
}

export default Utils
