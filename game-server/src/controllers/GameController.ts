import { TPlayer } from '../types'
import { v4 as uuidv4 } from 'uuid'

import Game from '../game'

class _GameController {
  games: Record<string, Game>
  queue: Partial<TPlayer>[]
  queueId: string

  constructor() {
    this.games = {}
    this.queue = []
    this.queueId = uuidv4()
  }

  addPlayerToQueue(player: Partial<TPlayer>) {
    const queuedPlayersIds = this.queue.map(q => q.id)
    if (queuedPlayersIds.includes(player.id)) throw new Error('Already on the queue')
    this.queue.push(player)
    return { queueId: this.queueId, queue: this.queue }
  }

  startNewGame() {
    if (this.queue.length < 2) throw new Error('Required at least 2 players')

    const newGame = new Game({ players: [...this.queue], id: this.queueId })
    this.games[this.queueId] = newGame

    newGame.start()
    this.cleanUpQueue()

    return newGame
  }

  private cleanUpQueue() {
    this.queue.length = 0
    this.queueId = uuidv4()
  }
}

const GameController = new _GameController()

export default GameController
