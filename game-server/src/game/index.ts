import { TNumOfPlayers, TPlayer, TRound, WithRequired } from '../types'
import Round from './round'
import Utils from '../utils'
import fs from 'fs'

import app from '../app'

class Game {
  id: string
  leaderId: string
  players: TPlayer[]
  numOfPlayers: TNumOfPlayers
  currentRound: TRound
  rounds: TRound[]
  currentRoundNumber: Round['currentRoundNumber']
  scoreboardShowing: boolean

  constructor({ players, id, leaderId }: { players: TPlayer[], id: string, leaderId: string }) {
    this.id = id
    this.leaderId = leaderId
    this.players = players
    this.numOfPlayers = players.length as TNumOfPlayers
    this.currentRoundNumber = 1
    this.rounds = [] as Round[]
    this.currentRound = {} as Round
    this.scoreboardShowing = false
  }

  start() {
    global.log('Game started!')(this.id)
    fs.rmSync('game.txt')
    this.startRound()
  }

  private end() {
    this.players = this.scoreboard
    this.sendScoreboardSocket()
    console.log('\nGame ended!', ` Winner: ${this.players[0].name} with ${this.players[0].totalPoints}`)
    console.log('results', JSON.stringify(this.rounds.length))
  }

  private startRound() {
    global.log('\n====================')(this.id)
    global.log(`\nRound ${this.currentRoundNumber} started!`)(this.id)
    this.currentRound = new Round(this.id, this.currentRoundNumber, this.players)
    global.log(this.currentRound.cardsForEachPlayer, 'cards')(this.id)
    global.log('trunfo', this.currentRound.trunfo, '\n')(this.id)
    global.log('[CARDS]')(this.id)
    app.io.to(this.id).emit('round-started', this.currentRound)
    this.currentRound.players.forEach(player => {
      if (player.socket) {
        app.io.to(player.socket).emit('cards', player.cards)
      }
      global.log(player.cards?.join(', '))(player.socket)
    })
    // global.log(this.currentRound.players.map(p => `${p.name}: ${p.cards.join(', ')} \n`).join(''))
    global.log('[BETS]')(this.id)
  }

  endRound() {
    this.rounds.push(this.currentRound)
    if (this.currentRoundNumber === 13) {
      this.end()
      return
    }
    if (this.currentRoundNumber === 7) {
      this.scoreboardShowing = true
      this.sendScoreboardSocket()
    }
    this.currentRoundNumber++
    this.rotatePlayers()
    global.log('Round ended!')(this.id)
    app.io.to(this.id).emit('round-ended', this.currentRound.bailadores)
    setTimeout(this.startRound.bind(this), 3000)
  }

  get scoreboard() {
    this.players.forEach(player => {
      player.totalPoints = this.rounds.reduce((acc, cur) => acc + (cur.players.find(p => p.id === player.id) as TPlayer).points, 0)
    })

    return Utils.sortPlayersByPoint(this.players as WithRequired<TPlayer, 'totalPoints'>[])
  }

  private sendScoreboardSocket() {
    app.io.to(this.id).emit('scoreboard', this.scoreboard)
  }

  private rotatePlayers() {
    this.players.push(this.players.shift() as TPlayer)
  }
}

export default Game
