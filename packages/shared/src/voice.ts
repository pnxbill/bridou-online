/**
 * Voice chat signaling contract, shared by the game server (thin relay) and
 * the web client (WebRTC peers). The server never touches audio: it only
 * forwards these messages between the browsers of a game so they can open
 * direct peer-to-peer audio connections.
 */

/**
 * Structural mirror of the DOM's `RTCIceCandidateInit` — declared here because
 * this package compiles without the DOM lib (the server consumes it too).
 */
export interface VoiceIceCandidate {
  candidate?: string
  sdpMLineIndex?: number | null
  sdpMid?: string | null
  usernameFragment?: string | null
}

/** A point-to-point signaling message, relayed by the server to `to` only. */
export type VoiceSignal =
  | { type: 'offer'; from: string; to: string; sdp: string }
  | { type: 'answer'; from: string; to: string; sdp: string }
  | { type: 'ice'; from: string; to: string; candidate: VoiceIceCandidate }

/** One participant of a game's voice room, as seen by the others. */
export interface VoicePresence {
  playerId: string
  micMuted: boolean
}
