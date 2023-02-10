import type { TCard } from '~/components/hand';
import { TRound } from '..';
import type { TNumOfBet, TTurn } from '../../../../game-server/src/types';
import type { TGame } from '../../../../types'


function setGameListeners(socketInstance: any, state: TRound) {
  socketInstance.on('cards', (res: TCard['value'][]) => {
    state.cards = res.map(r => ({ value: r, disabled: true}))
  })

  socketInstance.on('play-time', (res: TCard[]) => {
    state.cards = res
  })

  socketInstance.on('bet-time', (res: number[]) => {     
    state.betAvailable = res
  })

  socketInstance.on('player-bet', (res: {id: string, bet: TNumOfBet}) => {
    state.players = state.players.map(p => p.id === res.id ? ({...p, bet: res.bet }) : p)
  })

  socketInstance.on('player-play', (res: string[]) => {
    state.playedCards = res
  })

  socketInstance.on('turn-ended', (res: TTurn) => {
    state.currentTurn = res
    state.turns = [...state.turns, res]
  })

  socketInstance.on('turn-started', (res: TTurn) => {
    state.currentTurn = res
  })

  socketInstance.on('set-trunfo', (res: string) => {
    state.trunfo = res
  })

  socketInstance.on('round-ended', (res: TGame['currentRound']['bailadores']) => {
    state.bailadores = res
    state.playedCards = []
    state.turns = []
  })

  socketInstance.on('round-started', (res: TGame['currentRound']) => {
    state.trunfo = res.trunfo
    state.players = res.players
    state.turns = res.turns
    state.numOfCards = res.cardsForEachPlayer
  })
}

export default setGameListeners