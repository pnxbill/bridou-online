'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useVoiceChat, type VoiceChat } from './useVoiceChat'

interface VoiceRoom {
  voice: VoiceChat
  /** Bind this screen to a voice room (lobby id = game id). */
  enter: (roomId: string, playerId: string) => void
  /** Release the binding — hang-up is deferred so lobby→game keeps the mesh. */
  exit: (roomId: string, playerId: string) => void
}

const VoiceRoomContext = createContext<VoiceRoom | null>(null)

/**
 * Owns the voice mesh above the route tree so joining in the lobby and then
 * walking into the game (same room id) doesn't tear the call down.
 */
export function VoiceRoomProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<{ roomId: string; playerId: string } | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enter = useCallback((roomId: string, playerId: string) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
    setRoom((prev) =>
      prev?.roomId === roomId && prev?.playerId === playerId ? prev : { roomId, playerId },
    )
  }, [])

  const exit = useCallback((roomId: string, playerId: string) => {
    clearTimer.current = setTimeout(() => {
      setRoom((prev) =>
        prev?.roomId === roomId && prev?.playerId === playerId ? null : prev,
      )
      clearTimer.current = null
    }, 400)
  }, [])

  const voice = useVoiceChat({
    gameId: room?.roomId ?? '',
    playerId: room?.playerId ?? '',
  })

  // Hang up once nobody is bound to the room (left the table / left the game)
  const leave = voice.leave
  useEffect(() => {
    if (!room) leave()
  }, [room, leave])

  const value = useMemo(() => ({ voice, enter, exit }), [voice, enter, exit])

  return <VoiceRoomContext.Provider value={value}>{children}</VoiceRoomContext.Provider>
}

export function useVoiceRoom(): VoiceRoom {
  const ctx = useContext(VoiceRoomContext)
  if (!ctx) throw new Error('useVoiceRoom must be used inside VoiceRoomProvider')
  return ctx
}
