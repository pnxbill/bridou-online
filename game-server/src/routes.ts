import { Router } from 'express'
import GameController from './controllers/GameController'
import app from './app'

const routes = Router()

routes.post('/api/enter-queue', (req, res) => {
  const { user } = req.body

  try {
    const { queueId, queue } = GameController.addPlayerToQueue(user) || {}
    app.io.to(queueId).emit('player-entered-queue', queue.at(-1))
    res.json({
      message: 'ok',
      queueId,
      leaderId: queue[0].id
    }).status(200)
  } catch (err) {
    if (err instanceof Error)
      res.status(401).json({
        message: err.message
      })
  }
})

routes.get('/api/start-game', (req, res) => {
  try {
    const game = GameController.startNewGame()
    app.io.to(game.id).emit('game-started')
    res.json({
      message: 'ok',
      gameId: game.id
    }).status(200)
  } catch (err) {
    if (err instanceof Error)
      res.status(401).json({
        message: err.message
      })
  }
})

routes.post('/api/enter-game', (req, res) => {
  const { gameId, playerId } = req.body
  if (!gameId || !playerId) return
  const game = GameController.games[gameId]
  const player = game?.players.find(p => p.id === playerId)

  if (game) {
    if (!player) {
      res.status(401).json({
        message: 'You\'re not in this game'
      })
      return
    }

    res.json({
      message: 'ok',
      game: { 
        ...game,
        scoreboard: game.scoreboard,
        playableCards: game.currentRound.getPlayableCards.bind(game.currentRound, playerId)(),
        availableBets: game.currentRound.getAvailableBets.bind(game.currentRound, playerId)(),
        time: Date.now()
      }
    }).status(200)
  } else {
    res.status(404).json({
      message: 'Game not found'
    })
  }
})

routes.post('/api/bet', (req, res) => {
  const { gameId, playerId, bet } = req.body
  if (!gameId || !playerId || isNaN(bet)) return
  const game = GameController.games[gameId]

  try {
    game.currentRound.addBetToPlayer(playerId, bet)
    res.json({
      message: 'ok'
    }).status(200)
  } catch (err) {
    if (err instanceof Error)
      res.status(401).json({
        message: err.message
      })
  }
})

routes.post('/api/play-card', (req, res) => {
  const { gameId, playerId, card } = req.body
  if (!gameId || !playerId || !card) return
  const game = GameController.games[gameId]

  try {
    game.currentRound.currentTurn?.playCard(playerId, card)
    res.json({
      message: 'ok'
    }).status(200)
  } catch (err) {
    if (err instanceof Error)
      res.status(401).json({
        message: err.message
      })
  }
})

routes.get('/api/queue', (req, res) => {
  const { queue, queueId } = GameController
  res.status(200).json({
    message: 'ok',
    leaderId: queue[0]?.id,
    queueId,
    queue
  })
})

routes.get('/api/close-score', (req, res) => {
  let { gameId } = req.query
  if (!gameId) return
  gameId = String(gameId)
  const { games } = GameController
  if (!games[gameId]) return

  app.io.to(gameId).emit('close-scoreboard')
  games[gameId].scoreboardShowing = false
  res.status(200).json({
    message: 'ok',
  })
})

export default routes
