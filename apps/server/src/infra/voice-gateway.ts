import type { VoicePresence, VoiceSignal } from '@bridou/shared'
import type { Server } from 'socket.io'
import type { TokenVerifier } from '../application/ports'

/**
 * Signaling relay for per-game voice chat, on the `/voice` namespace.
 *
 * Audio never touches the server — browsers connect to each other directly
 * (WebRTC mesh). This relay only tracks who is in each game's voice room and
 * forwards offers/answers/ICE candidates between them:
 *
 * - joiner receives `voice:roster` (everyone already in) and offers to each
 * - the room hears `voice:peer-joined` / `voice:peer-left` / `voice:mute-changed`
 * - `voice:signal` messages are delivered only to their target player
 *
 * Rooms live in memory and die with the process, like the game repository.
 */
export interface VoiceRooms {
  rosterOf(gameId: string): VoicePresence[]
}

interface Member {
  socketId: string
  micMuted: boolean
}

export const registerVoiceHandlers = (io: Server, verifier: TokenVerifier): VoiceRooms => {
  const voice = io.of('/voice')
  const rooms = new Map<string, Map<string, Member>>()

  // Voice is players-only: the handshake must carry a valid token, and the
  // seat is keyed by the VERIFIED uid so nobody can join (or signal) as
  // someone else.
  voice.use((socket, next) => {
    const { gameId, token } = socket.handshake.auth as { gameId?: string; token?: string }
    if (!gameId || !token) return next(new Error('Unauthorized'))
    verifier
      .verify(token)
      .then((player) => {
        if (!player) return next(new Error('Unauthorized'))
        socket.data.playerId = player.id
        next()
      })
      .catch(next)
  })

  voice.on('connection', (socket) => {
    const { gameId } = socket.handshake.auth as { gameId: string }
    const playerId = socket.data.playerId as string

    let room = rooms.get(gameId)
    if (!room) {
      room = new Map()
      rooms.set(gameId, room)
    }

    // A reconnect (e.g. page refresh) replaces the player's stale connection.
    // Take the seat BEFORE kicking the old socket: its disconnect handler
    // sees it no longer owns the seat and leaves the roster alone.
    const stale = room.get(playerId)
    socket.join(gameId)
    room.set(playerId, { socketId: socket.id, micMuted: false })
    if (stale) voice.sockets.get(stale.socketId)?.disconnect(true)

    const roster: VoicePresence[] = [...room.entries()]
      .filter(([id]) => id !== playerId)
      .map(([id, member]) => ({ playerId: id, micMuted: member.micMuted }))
    socket.emit('voice:roster', roster)
    socket.to(gameId).emit('voice:peer-joined', { playerId, micMuted: false })

    socket.on('voice:signal', (signal: VoiceSignal) => {
      const target = room.get(signal.to)
      if (!target) return
      // `from` is stamped server-side so peers can't impersonate each other
      voice.to(target.socketId).emit('voice:signal', { ...signal, from: playerId })
    })

    socket.on('voice:mute-changed', (micMuted: unknown) => {
      const member = room.get(playerId)
      if (!member || member.socketId !== socket.id) return
      member.micMuted = micMuted === true
      socket.to(gameId).emit('voice:mute-changed', { playerId, micMuted: member.micMuted })
    })

    socket.on('disconnect', () => {
      // Ignore if a newer connection for this player already took the seat
      if (room.get(playerId)?.socketId !== socket.id) return
      room.delete(playerId)
      if (room.size === 0) rooms.delete(gameId)
      socket.to(gameId).emit('voice:peer-left', { playerId })
    })
  })

  return {
    rosterOf: (gameId) =>
      [...(rooms.get(gameId)?.entries() ?? [])].map(([playerId, member]) => ({
        playerId,
        micMuted: member.micMuted,
      })),
  }
}
