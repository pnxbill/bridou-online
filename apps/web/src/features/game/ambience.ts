/**
 * The room the table sits in.
 *
 * Two halves, both cosmetic and both about the same thing — making the felt
 * feel like a place rather than an interface:
 *
 *  - `timeOfDay` shifts the lighting with the player's own clock, so a game at
 *    2am looks like a game at 2am
 *  - `startAmbience` runs a very quiet room tone underneath everything
 *
 * Neither touches gameplay, and both respect the existing sound mute.
 */

export type TimeOfDay = 'tarde' | 'entardecer' | 'noite' | 'madrugada'

/** Which lighting the local hour falls into. */
export const timeOfDayFor = (date: Date = new Date()): TimeOfDay => {
  const hour = date.getHours()
  if (hour >= 6 && hour < 16) return 'tarde'
  if (hour >= 16 && hour < 19) return 'entardecer'
  if (hour >= 19 || hour < 1) return 'noite'
  return 'madrugada'
}

/* ── room tone ───────────────────────────────────────────────────────────── */

let ambience: {
  ctx: AudioContext
  gain: GainNode
  nodes: AudioScheduledSourceNode[]
} | null = null

const TARGET_GAIN = 0.035

/**
 * A low filtered-noise bed with a slow drift — the sound of a room with people
 * in it, mixed far enough down that you notice it only when it stops.
 *
 * Must be called from a user gesture (browsers keep AudioContext suspended
 * otherwise). Safe to call repeatedly; a second call is a no-op.
 */
export const startAmbience = (): void => {
  if (ambience || typeof window === 'undefined') return

  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return

  const ctx = new AC()
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.connect(ctx.destination)

  // Two seconds of noise, looped — long enough that the loop point is inaudible.
  const length = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    // brown-ish noise: integrated white noise, much warmer than raw hiss
    last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995
    data[i] = last
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  noise.loop = true

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(420, ctx.currentTime)

  // A very slow wobble on the filter keeps it from sounding like a dead hum.
  const drift = ctx.createOscillator()
  drift.frequency.setValueAtTime(0.05, ctx.currentTime)
  const driftGain = ctx.createGain()
  driftGain.gain.setValueAtTime(120, ctx.currentTime)
  drift.connect(driftGain).connect(lowpass.frequency)

  noise.connect(lowpass).connect(gain)
  noise.start()
  drift.start()

  gain.gain.exponentialRampToValueAtTime(TARGET_GAIN, ctx.currentTime + 3)
  ambience = { ctx, gain, nodes: [noise, drift] }

  void ctx.resume().catch(() => {})
}

/** Fades the bed out and tears the graph down. */
export const stopAmbience = (): void => {
  if (!ambience) return
  const { ctx, gain, nodes } = ambience
  ambience = null

  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)

  setTimeout(() => {
    for (const node of nodes) {
      try {
        node.stop()
      } catch {
        // already stopped
      }
    }
    void ctx.close().catch(() => {})
  }, 1000)
}

export const isAmbiencePlaying = (): boolean => ambience !== null
