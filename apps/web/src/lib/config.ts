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

/** @deprecated Prefer `getServerUrl()` — kept for call sites that only run on the server. */
export const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001'
