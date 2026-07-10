'use client'

import type { HandCard } from '@bridou/shared'
import { useCallback, useReducer } from 'react'
import { api, type GameEntry } from '@/lib/api'
import { gameReducer, stateFromSnapshot } from './reducer'
import { useGameChannel } from './useGameChannel'
import { AbandonedOverlay } from './components/AbandonedOverlay'
import { BailadoresOverlay } from './components/BailadoresOverlay'
import { GameTable } from './components/GameTable'
import { ScoreboardOverlay } from './components/ScoreboardOverlay'

interface Props {
  gameId: string
  playerId: string
  initialSnapshot: GameEntry
}

export function GameClient({ gameId, playerId, initialSnapshot }: Props) {
  const [state, dispatch] = useReducer(gameReducer, initialSnapshot, (snapshot) =>
    stateFromSnapshot(snapshot, playerId),
  )

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

  return (
    <>
      <GameTable state={state} onPlay={playCard} onBet={placeBet} />

      {state.scoreboard && (
        <ScoreboardOverlay
          scoreboard={state.scoreboard}
          onClose={state.leaderId === playerId ? () => api.closeScore(gameId) : undefined}
        />
      )}
      {!state.scoreboard && state.abandoned.length > 0 && (
        <AbandonedOverlay seats={state.abandoned} players={state.players} />
      )}
      {!state.scoreboard && !state.abandoned.length && state.bailadores.length > 0 && (
        <BailadoresOverlay bailadores={state.bailadores} />
      )}
    </>
  )
}
