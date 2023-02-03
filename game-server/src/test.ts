import Game from './game'
import mockData from './mock.json'
import fs from 'fs'
import GameController from './controllers/GameController'

// Define the custom log function
function log(...args: any[]) {
  console.log(...args)

  // Append a new line with all the arguments to the `game.txt` file
  fs.appendFileSync('game.txt', args.join(' ') + '\n')
}

// Add the custom log function to the global object
global.log = log

const game = new Game(mockData)
GameController.games[game.id] = game
game.start()
// const { players } = game.currentRound

for (let x = 0; x < 13; x++) {
  // Add bets
  game.currentRound.players.forEach((player, idx) => {
    game.currentRound.addBetToPlayer(player.id, idx === 0 ? 1 : 0)
  })

  const numOfCards = game.currentRound.cardsForEachPlayer

  // Play cards
  for (let i = 0; i < numOfCards; i++) {
    let lastPlayer

    if (!game.currentRound.whoMade.length) lastPlayer = game.currentRound.players.at(-1)

    else {
      const currentMade = game.currentRound.whoMade.at(-1)
      const currentMadeIdx = game.currentRound.players.findIndex(player => player.id === currentMade.id)
      lastPlayer = game.currentRound.players[
        currentMadeIdx === 0 ? (game.currentRound.numOfPlayers - 1) : currentMadeIdx - 1
      ]
    }

    const newPlayers = [...game.currentRound.players]

    while (newPlayers.at(-1).name !== lastPlayer.name) {
      newPlayers.unshift(newPlayers.pop())
    }

    newPlayers.forEach(player => {
      const { currentSuit, players } = game.currentRound
      const { cards } = players.find(p => p.id === player.id)

      // Play first card found with same suit as the current, or the first card on hand
      const playCard = cards.find(c => c.includes(currentSuit)) || cards[0]

      game.currentRound.playCard(player.id, playCard)
    })
  }
}
