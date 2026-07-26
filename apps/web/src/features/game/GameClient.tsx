'use client'

import { HIDDEN_CARD, type HandCard } from '@bridou/shared'
import { useCallback, useEffect, useReducer } from 'react'
import { api, type GameEntry } from '@/lib/api'
import { gameReducer, stateFromSnapshot } from './reducer'
import { useGameChannel } from './useGameChannel'
import { AbandonedOverlay } from './components/AbandonedOverlay'
import { EmoteWheel } from './components/EmoteWheel'
import { GameTable } from './components/GameTable'
import { PauseButton } from './components/PauseButton'
import { PausedOverlay } from './components/PausedOverlay'
import { RoundEndOverlay } from './components/RoundEndOverlay'
import { ScoreboardOverlay } from './components/ScoreboardOverlay'
import { TableToasts } from './components/TableToasts'
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
    // blind round: we don't know our own card, so it can't be drawn on the
    // table optimistically — just freeze the hand until the server confirms
    if (card.value === HIDDEN_CARD) {
      dispatch({ type: 'lock-hand' })
    } else {
      dispatch({ type: 'optimistic-play', card: card.value })
    }
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

  const dismissToast = useCallback((id: string) => dispatch({ type: 'dismiss-toast', id }), [])

  // Fire-and-forget: a rejected provocação (cooldown, bad id) is not worth
  // interrupting the game for — the wheel already went back to idle.
  const sendEmote = useCallback(
    (emoteId: string) => {
      api.sendEmote(gameId, emoteId).catch(() => {})
    },
    [gameId],
  )

  return (
    <>
      <GameTable
        state={state}
        onPlay={playCard}
        onBet={placeBet}
        speakingIds={voice.speakingIds}
      />
      <TableToasts toasts={state.toasts} players={state.players} onDismiss={dismissToast} />
      {!state.gameOver && !state.pausedBy && (
        <>
          <PauseButton onPause={() => api.pauseGame(gameId).catch(resync)} />
          <EmoteWheel onSend={sendEmote} />
        </>
      )}
      <VoiceControls voice={voice} players={state.players} />

      {state.scoreboard && (
        <ScoreboardOverlay
          scoreboard={state.scoreboard}
          final={state.gameOver}
          gameId={gameId}
          onClose={
            !state.gameOver && state.leaderId === playerId
              ? () => api.closeScore(gameId)
              : undefined
          }
        />
      )}
      {/* a deliberate pause outranks everything except the scoreboard */}
      {!state.scoreboard && state.pausedBy && (
        <PausedOverlay
          pausedBy={state.pausedBy}
          players={state.players}
          myId={playerId}
          leaderId={state.leaderId}
          onResume={() => api.resumeGame(gameId).catch(resync)}
        />
      )}
      {!state.scoreboard && !state.pausedBy && state.abandoned.length > 0 && (
        <AbandonedOverlay seats={state.abandoned} players={state.players} />
      )}
      {!state.scoreboard && !state.pausedBy && !state.abandoned.length && state.lastRoundResult && (
        <RoundEndOverlay
          key={state.lastRoundResult.round}
          result={state.lastRoundResult}
          playerId={playerId}
        />
      )}
    </>
  )
}
