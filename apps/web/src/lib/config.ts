/**
 * Game server base URL.
 *
 * - `NEXT_PUBLIC_GAME_SERVER_URL` wins when set (production / explicit override).
 * - In the browser, default to the same host as the page on port 3001 so phones
 *   on the LAN (`http://192.168.x.x:3000`) hit the Mac's game server, not the
 *   phone's own localhost.
 * - On the Next server (SSR / RSC), default to localhost — same machine as `pnpm dev`.
 */
export const getServerUrl = (): string => {
  const fromEnv = process.env.NEXT_PUBLIC_GAME_SERVER_URL
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:3001`
  }

  return 'http://localhost:3001'
}

/**
 * ICE servers for the voice chat's WebRTC connections. Public STUN is enough
 * for most home networks; set the NEXT_PUBLIC_TURN_* vars to add a relay for
 * players behind strict NATs (no code change needed).
 */
export const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    })
  }

  return servers
}
