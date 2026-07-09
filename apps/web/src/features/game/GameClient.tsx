'use client'

import type { HandCard } from '@bridou/shared'
import { useCallback, useReducer } from 'react'
import { api, type GameEntry } from '@/lib/api'
import { gameReducer, stateFromSnapshot } from './reducer'
import { useGameChannel } from './useGameChannel'
import { AbandonedOverlay } from './components/AbandonedOverlay'
import { BailadoresOverlay } from './components/BailadoresOverlay'
import { BetPicker } from './components/BetPicker'
import { BetsBar } from './components/BetsBar'
import { PlayerHand } from './components/PlayerHand'
import { ScoreboardOverlay } from './components/ScoreboardOverlay'
import { Table } from './components/Table'
import { Trunfo } from './components/Trunfo'

interface Props {
  gameId: string
  playerId: string
  initialSnapshot: GameEntry
}

export function GameClient({ gameId, playerId, initialSnapshot }: Props) {
  const [state, dispatch] = useReducer(gameReducer, initialSnapshot, stateFromSnapshot)

  const resync = useCallback(async () => {
    try {
      const { game } = await api.enterGame(gameId, playerId)
      dispatch({ type: 'sync', snapshot: game })
    } catch {
      // server unreachable — the channel will retry and call us again
    }
  }, [gameId, playerId])

  useGameChannel({
    gameId,
    playerId,
    onEvent: (event) => dispatch({ type: 'apply-event', event }),
    onReconnect: resync,
  })

  const playCard = async (card: HandCard) => {
    if (card.disabled) return
    dispatch({ type: 'lock-hand' })
    try {
      await api.playCard(gameId, playerId, card.value)
    } catch {
      resync() // rejected play (e.g. wrong suit) — recover the real state
    }
  }

  const placeBet = async (bet: number) => {
    dispatch({ type: 'clear-bets' })
    try {
      await api.placeBet(gameId, playerId, bet)
    } catch {
      resync()
    }
  }

  if (state.scoreboard) {
    return (
      <ScoreboardOverlay
        scoreboard={state.scoreboard}
        onClose={state.leaderId === playerId ? () => api.closeScore(gameId) : undefined}
      />
    )
  }

  if (state.abandoned.length) {
    return <AbandonedOverlay seats={state.abandoned} players={state.players} />
  }

  if (state.bailadores.length) {
    return <BailadoresOverlay bailadores={state.bailadores} />
  }

  return (
    <div className="game">
      <div className="status-bar">
        <BetsBar players={state.players} betting={state.betting} botSeats={state.botSeats} />
        <Trunfo card={state.trunfo} />
      </div>

      <Table
        playedCards={state.playedCards}
        currentTurn={state.currentTurn}
        turnNumber={state.turnsCompleted + 1}
        maxTurns={state.cardsForEachPlayer}
      />

      <BetPicker bets={state.availableBets} onBet={placeBet} />
      <PlayerHand cards={state.hand} onPlay={playCard} />
    </div>
  )
}
