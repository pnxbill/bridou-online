'use client'

import type { VoicePresence, VoiceSignal } from '@bridou/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { api } from '@/lib/api'
import { getIceServers, getServerUrl } from '@/lib/config'

export type VoiceStatus = 'idle' | 'joining' | 'connected' | 'error'

export interface VoiceParticipant extends VoicePresence {
  /** Peer connection health, for a subtle "connecting…" hint in the UI. */
  connection: 'connecting' | 'connected' | 'failed'
}

export interface VoiceChat {
  status: VoiceStatus
  /** 'mic-denied' when the browser refused microphone access. */
  error: 'mic-denied' | 'unavailable' | null
  /** Everyone else currently in the voice room (never includes myself). */
  participants: VoiceParticipant[]
  /** How many players are in voice while I'm not — feeds "Join voice (N)". */
  othersInVoice: number
  /** Players talking right now (may include myself) — drives avatar glows. */
  speakingIds: string[]
  micMuted: boolean
  deafened: boolean
  join: () => void
  leave: () => void
  toggleMic: () => void
  toggleDeafen: () => void
}

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement | null
  /** ICE candidates that arrived before the remote description was set. */
  pendingCandidates: RTCIceCandidateInit[]
}

interface Options {
  gameId: string
  playerId: string
}

/**
 * Owns the whole voice lifecycle: microphone capture, the socket.io `/voice`
 * signaling channel, and one RTCPeerConnection per other participant (full
 * mesh — audio flows browser-to-browser, the server only relays signaling).
 *
 * Negotiation is glare-free by construction: whoever receives the roster
 * (the joiner) offers to everyone already in the room; existing members
 * only ever answer.
 */
export function useVoiceChat({ gameId, playerId }: Options): VoiceChat {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [error, setError] = useState<'mic-denied' | 'unavailable' | null>(null)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [othersInVoice, setOthersInVoice] = useState(0)
  const [micMuted, setMicMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)

  const [speakingIds, setSpeakingIds] = useState<string[]>([])

  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef(new Map<string, Peer>())
  const deafenedRef = useRef(false)

  // Voice-activity detection: one AnalyserNode per stream (mine + each peer),
  // sampled on an interval while connected
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analysersRef = useRef(new Map<string, AnalyserNode>())
  const speakingHoldRef = useRef(new Map<string, number>())

  const watchStream = useCallback((id: string, stream: MediaStream) => {
    const ctx = (audioCtxRef.current ??= new AudioContext())
    void ctx.resume().catch(() => {})
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    analysersRef.current.set(id, analyser)
  }, [])

  const updateParticipant = useCallback(
    (id: string, patch: Partial<Omit<VoiceParticipant, 'playerId'>>) => {
      setParticipants((current) =>
        current.map((p) => (p.playerId === id ? { ...p, ...patch } : p)),
      )
    },
    [],
  )

  const closePeer = useCallback((id: string) => {
    const peer = peersRef.current.get(id)
    if (!peer) return
    peersRef.current.delete(id)
    analysersRef.current.delete(id)
    speakingHoldRef.current.delete(id)
    peer.pc.onicecandidate = null
    peer.pc.ontrack = null
    peer.pc.onconnectionstatechange = null
    peer.pc.close()
    if (peer.audio) {
      peer.audio.pause()
      peer.audio.srcObject = null
      peer.audio.remove()
    }
  }, [])

  const createPeer = useCallback(
    (peerId: string): Peer => {
      closePeer(peerId) // renegotiation (e.g. peer refreshed) starts clean

      const pc = new RTCPeerConnection({ iceServers: getIceServers() })
      const peer: Peer = { pc, audio: null, pendingCandidates: [] }
      peersRef.current.set(peerId, peer)

      const stream = streamRef.current
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream)

      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        const signal: VoiceSignal = {
          type: 'ice',
          from: playerId,
          to: peerId,
          candidate: event.candidate.toJSON(),
        }
        socketRef.current?.emit('voice:signal', signal)
      }

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        if (!remoteStream) return
        const audio = peer.audio ?? new Audio()
        peer.audio = audio
        audio.autoplay = true
        audio.srcObject = remoteStream
        audio.muted = deafenedRef.current
        // Keep it in the DOM (invisible) so the browser never garbage-collects
        // a playing element out from under us
        if (!audio.isConnected) {
          audio.style.display = 'none'
          document.body.append(audio)
        }
        void audio.play().catch(() => {
          // Autoplay was blocked; the joiner clicked to get here, so this is
          // rare — the next play() (e.g. after un-deafening) will succeed.
        })
        watchStream(peerId, remoteStream)
      }

      pc.onconnectionstatechange = () => {
        const map: Record<string, VoiceParticipant['connection'] | undefined> = {
          connected: 'connected',
          connecting: 'connecting',
          failed: 'failed',
          disconnected: 'connecting',
        }
        const connection = map[pc.connectionState]
        if (connection) updateParticipant(peerId, { connection })
      }

      return peer
    },
    [closePeer, playerId, updateParticipant, watchStream],
  )

  const sendOffer = useCallback(
    async (peerId: string) => {
      const { pc } = createPeer(peerId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const signal: VoiceSignal = {
        type: 'offer',
        from: playerId,
        to: peerId,
        sdp: offer.sdp ?? '',
      }
      socketRef.current?.emit('voice:signal', signal)
    },
    [createPeer, playerId],
  )

  const flushCandidates = useCallback(async (peer: Peer) => {
    const pending = peer.pendingCandidates.splice(0)
    for (const candidate of pending) {
      await peer.pc.addIceCandidate(candidate).catch(() => {})
    }
  }, [])

  const handleSignal = useCallback(
    async (signal: VoiceSignal) => {
      if (signal.type === 'offer') {
        const peer = createPeer(signal.from)
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        const answer = await peer.pc.createAnswer()
        await peer.pc.setLocalDescription(answer)
        await flushCandidates(peer)
        const reply: VoiceSignal = {
          type: 'answer',
          from: playerId,
          to: signal.from,
          sdp: answer.sdp ?? '',
        }
        socketRef.current?.emit('voice:signal', reply)
        return
      }

      const peer = peersRef.current.get(signal.from)
      if (!peer) return

      if (signal.type === 'answer') {
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        await flushCandidates(peer)
        return
      }

      if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(signal.candidate).catch(() => {})
      } else {
        peer.pendingCandidates.push(signal.candidate)
      }
    },
    [createPeer, flushCandidates, playerId],
  )

  const leave = useCallback(() => {
    socketRef.current?.disconnect()
    socketRef.current = null
    for (const id of [...peersRef.current.keys()]) closePeer(id)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    deafenedRef.current = false
    analysersRef.current.clear()
    speakingHoldRef.current.clear()
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    setSpeakingIds([])
    setParticipants([])
    setMicMuted(false)
    setDeafened(false)
    setStatus('idle')
  }, [closePeer])

  const join = useCallback(async () => {
    if (socketRef.current) return
    setStatus('joining')
    setError(null)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'mic-denied'
          : 'unavailable',
      )
      return
    }
    streamRef.current = stream
    watchStream(playerId, stream) // my own voice activity (muted mic reads as silence)

    const socket = io(`${getServerUrl()}/voice`, { auth: { gameId, playerId } })
    socketRef.current = socket

    socket.on('voice:roster', (roster: VoicePresence[]) => {
      // Also fires after a signaling reconnect: rebuild the mesh from scratch
      // (everyone saw us leave and rejoin, so they expect fresh offers)
      for (const id of [...peersRef.current.keys()]) closePeer(id)
      setParticipants(
        roster.map((p) => ({ ...p, connection: 'connecting' as const })),
      )
      setStatus('connected')
      for (const p of roster) void sendOffer(p.playerId)
    })

    socket.on('voice:peer-joined', (peer: VoicePresence) => {
      // The newcomer will offer to us — just show them as connecting
      setParticipants((current) => [
        ...current.filter((p) => p.playerId !== peer.playerId),
        { ...peer, connection: 'connecting' },
      ])
    })

    socket.on('voice:peer-left', ({ playerId: id }: { playerId: string }) => {
      closePeer(id)
      setParticipants((current) => current.filter((p) => p.playerId !== id))
    })

    socket.on('voice:signal', (signal: VoiceSignal) => void handleSignal(signal))

    socket.on(
      'voice:mute-changed',
      ({ playerId: id, micMuted: muted }: { playerId: string; micMuted: boolean }) => {
        updateParticipant(id, { micMuted: muted })
      },
    )

    socket.on('connect_error', () => {
      // Initial connection failing entirely → surface it; socket.io retries
      if (peersRef.current.size === 0) setStatus((s) => (s === 'joining' ? 'error' : s))
    })
  }, [closePeer, gameId, handleSignal, playerId, sendOffer, updateParticipant, watchStream])

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    const muted = !track.enabled
    setMicMuted(muted)
    socketRef.current?.emit('voice:mute-changed', muted)
  }, [])

  const toggleDeafen = useCallback(() => {
    deafenedRef.current = !deafenedRef.current
    setDeafened(deafenedRef.current)
    for (const peer of peersRef.current.values()) {
      if (peer.audio) peer.audio.muted = deafenedRef.current
    }
  }, [])

  // Sample every analyser a few times a second; a short hold after the last
  // loud frame keeps the indicator from flickering between syllables
  useEffect(() => {
    if (status !== 'connected') return
    const buffer = new Uint8Array(512)

    const timer = setInterval(() => {
      const now = Date.now()
      const speaking: string[] = []

      for (const [id, analyser] of analysersRef.current) {
        analyser.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < analyser.fftSize; i++) {
          const deviation = ((buffer[i] ?? 128) - 128) / 128
          sum += deviation * deviation
        }
        const rms = Math.sqrt(sum / analyser.fftSize)
        if (rms > 0.04) speakingHoldRef.current.set(id, now + 400)
        if ((speakingHoldRef.current.get(id) ?? 0) > now) speaking.push(id)
      }

      setSpeakingIds((current) =>
        current.length === speaking.length && current.every((id, i) => id === speaking[i])
          ? current
          : speaking,
      )
    }, 150)

    return () => clearInterval(timer)
  }, [status])

  // Show how many friends are already talking while I haven't joined yet
  useEffect(() => {
    if (status !== 'idle') return
    let cancelled = false
    const poll = () =>
      api
        .voiceRoster(gameId)
        .then(({ participants: roster }) => {
          if (!cancelled) setOthersInVoice(roster.length)
        })
        .catch(() => {})
    poll()
    const timer = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [gameId, status])

  // Leaving the game page hangs up
  useEffect(() => leave, [leave])

  return {
    status,
    error,
    participants,
    othersInVoice,
    speakingIds,
    micMuted,
    deafened,
    join: () => void join(),
    leave,
    toggleMic,
    toggleDeafen,
  }
}
