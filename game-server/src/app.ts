import express from 'express'
import cors from 'cors'
// import mongoose from 'mongoose'
import http from 'http'
import { Server } from 'socket.io'
import routes from './routes'
import GameController from './controllers/GameController'

class App {
  public express: express.Application
  io: Server
  public server: any

  public constructor () {
    this.express = express()
    this.middlewares()
    this.routes()

    this.server = http.createServer(this.express)
    this.io = new Server(this.server, {
      cors: {
        origin: '*'
      }
    })

    this.socket()
    // this.database()
  }

  private middlewares () {
    this.express.use(express.json())
    this.express.use(cors())
  }

  private socket () {
    this.io.on('connection', socket => {
      const { gameId, playerId } = socket.handshake.auth
      console.log('A user connected: ', playerId)
      const game = GameController.games[gameId]
      const queue = GameController.queue
      socket.join(gameId)

      socket.on("disconnecting", (reason) => {
        console.log('socket disconnected, reason: ', reason)
        console.log(socket.rooms)
      })

      socket.conn.on("close", (reason) => {
        console.log('socket close, reason: ', reason)
        // called when the underlying connection is closed
      });

      if (game) {
        const playerIndex = game.players.findIndex(p => p.id === playerId)
        if (playerIndex > -1) {
          game.players[playerIndex].socket = socket.id
          game.currentRound.players[playerIndex].socket = socket.id
        }
      } else {
        const playerIndex = queue.findIndex(p => p.id === playerId)
        if (playerIndex > -1) queue[playerIndex].socket = socket.id
      }
    })
  }

  // private database () {
  //   mongoose.connect('mongodb://localhost:27017/tsnode')
  // }

  private routes () {
    this.express.use(routes)
  }
}

export default new App()
