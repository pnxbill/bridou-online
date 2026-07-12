'use client'

import type { HandCard } from '@bridou/shared'
import { useCallback, useEffect, useReducer } from 'react'
import { api, type GameEntry } from '@/lib/api'
import { gameReducer, stateFromSnapshot } from './reducer'
import { useGameChannel } from './useGameChannel'
import { AbandonedOverlay } from './components/AbandonedOverlay'
import { GameTable } from './components/GameTable'
import { RoundEndOverlay } from './components/RoundEndOverlay'
import { ScoreboardOverlay } from './components/ScoreboardOverlay'
import { VoiceControls } from './voice/VoiceControls'
import { useVoiceRoom } from './voice/VoiceRoomProvider'

interface Props {
  gameId: string
  playerId: string
  initialSnapshot: GameEntry
}

export function GameClient({ gameId, playerId, initialSnapshot }: Props) {
  const [state, dispatch] = useReducer(gameReducer, initialSnapshot, (snapshot) =>
    stateFromSnapshot(snapshot, playerId),
  )

  // Shared with the lobby so joining voice at the table carries into the game
  // (lobby id becomes the game id).
  const { voice, enter, exit } = useVoiceRoom()
  useEffect(() => {
    enter(gameId, playerId)
    return () => exit(gameId, playerId)
  }, [gameId, playerId, enter, exit])

  const resync = useCallback(async () => {
    try {
      const { game } = await api.enterGame(gameId)
      dispatch({ type: 'sync', snapshot: game })
    } catch {
      // server unreachable — the channel will retry and call us again
    }
  }, [gameId, playerId])

  useGameChannel({
    gameId,
    onEvent: (event) => dispatch({ type: 'apply-event', event }),
    onReconnect: resync,
  })

  const playCard = async (card: HandCard) => {
    if (card.disabled) return
    dispatch({ type: 'lock-hand' })
    try {
      await api.playCard(gameId, card.value)
    } catch {
      resync() // rejected play (e.g. wrong suit) — recover the real state
    }
  }

  const placeBet = async (bet: number) => {
    dispatch({ type: 'clear-bets' })
    try {
      await api.placeBet(gameId, bet)
    } catch {
      resync()
    }
  }

  return (
    <>
      <GameTable
        state={state}
        onPlay={playCard}
        onBet={placeBet}
        speakingIds={voice.speakingIds}
      />
      <VoiceControls voice={voice} players={state.players} />

      {state.scoreboard && (
        <ScoreboardOverlay
          scoreboard={state.scoreboard}
          final={state.gameOver}
          onClose={
            !state.gameOver && state.leaderId === playerId
              ? () => api.closeScore(gameId)
              : undefined
          }
        />
      )}
      {!state.scoreboard && state.abandoned.length > 0 && (
        <AbandonedOverlay seats={state.abandoned} players={state.players} />
      )}
      {!state.scoreboard && !state.abandoned.length && state.lastRoundResult && (
        <RoundEndOverlay
          key={state.lastRoundResult.round}
          result={state.lastRoundResult}
          playerId={playerId}
        />
      )}
    </>
  )
}
