'use client'

import type { HandCard } from '@bridou/shared'
import { useCallback, useReducer } from 'react'
import { api, type GameEntry } from '@/lib/api'
import { gameReducer, stateFromSnapshot } from './reducer'
import { useGameChannel } from './useGameChannel'
import { AbandonedOverlay } from './components/AbandonedOverlay'
import { GameTable } from './components/GameTable'
import { RoundEndOverlay } from './components/RoundEndOverlay'
import { ScoreboardOverlay } from './components/ScoreboardOverlay'
import { VoiceControls } from './voice/VoiceControls'
import { useVoiceChat } from './voice/useVoiceChat'

interface Props {
  gameId: string
  playerId: string
  initialSnapshot: GameEntry
}

export function GameClient({ gameId, playerId, initialSnapshot }: Props) {
  const [state, dispatch] = useReducer(gameReducer, initialSnapshot, (snapshot) =>
    stateFromSnapshot(snapshot, playerId),
  )

  // Lives here (not in VoiceControls) so the table can glow speaking avatars
  const voice = useVoiceChat({ gameId, playerId })

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
        <RoundEndOverlay key={state.lastRoundResult.round} result={state.lastRoundResult} />
      )}
    </>
  )
}
