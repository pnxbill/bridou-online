/**
 * Soft table SFX — PokerStars-ish: short, quiet, felt-muted.
 * Synthesized with Web Audio so we don't ship binary assets.
 *
 * Browsers keep AudioContext suspended until a user gesture; socket-driven
 * plays happen outside that gesture, so we unlock on first tap and always
 * resume before scheduling.
 */

let ctx: AudioContext | null = null
let unlockPromise: Promise<AudioContext | null> | null = null

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

const ensureRunning = async (): Promise<AudioContext | null> => {
  const ac = getCtx()
  if (!ac) return null
  if (ac.state === 'suspended') {
    try {
      await ac.resume()
    } catch {
      return null
    }
  }
  return ac.state === 'running' ? ac : null
}

/**
 * Must run inside a user gesture (tap/click). Plays a silent buffer so iOS
 * fully unlocks the context for later socket-driven SFX.
 */
export const unlockGameAudio = () => {
  if (unlockPromise) {
    void unlockPromise
    return
  }
  unlockPromise = (async () => {
    const ac = getCtx()
    if (!ac) return null
    try {
      await ac.resume()
    } catch {
      unlockPromise = null
      return null
    }
    // silent tick — required on iOS Safari to keep the context alive
    const buffer = ac.createBuffer(1, 1, ac.sampleRate)
    const src = ac.createBufferSource()
    src.buffer = buffer
    src.connect(ac.destination)
    src.start(0)
    return ac
  })()
  void unlockPromise
}

const noiseBuffer = (ac: AudioContext, seconds: number) => {
  const length = Math.max(1, Math.floor(ac.sampleRate * seconds))
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

const env = (
  param: AudioParam,
  peak: number,
  attack: number,
  release: number,
  at: number,
) => {
  param.cancelScheduledValues(at)
  param.setValueAtTime(0.0001, at)
  param.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack)
  param.exponentialRampToValueAtTime(0.0001, at + attack + release)
}

/**
 * Soft card-on-felt tap. Slight pitch jitter so consecutive plays don't
 * sound identical.
 */
export const playCardSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01
    const jitter = 0.92 + Math.random() * 0.16

    // body — muted low thud
    const thud = ac.createOscillator()
    const thudGain = ac.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(180 * jitter, t)
    thud.frequency.exponentialRampToValueAtTime(95 * jitter, t + 0.1)
    env(thudGain.gain, 0.28, 0.004, 0.1, t)
    thud.connect(thudGain).connect(ac.destination)
    thud.start(t)
    thud.stop(t + 0.14)

    // surface — brief filtered noise (paper/felt)
    const noise = ac.createBufferSource()
    noise.buffer = noiseBuffer(ac, 0.1)
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1100 * jitter, t)
    filter.Q.setValueAtTime(0.65, t)
    const noiseGain = ac.createGain()
    env(noiseGain.gain, 0.14, 0.002, 0.07, t)
    noise.connect(filter).connect(noiseGain).connect(ac.destination)
    noise.start(t)
    noise.stop(t + 0.1)
  })
}

/**
 * Soft scoop when the trick leaves the table — quiet whoosh + low settle.
 */
export const playTrickEndSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01

    // whoosh — descending bandpass noise
    const noise = ac.createBufferSource()
    noise.buffer = noiseBuffer(ac, 0.32)
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.setValueAtTime(1.1, t)
    filter.frequency.setValueAtTime(1600, t)
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.24)
    const noiseGain = ac.createGain()
    env(noiseGain.gain, 0.16, 0.02, 0.22, t)
    noise.connect(filter).connect(noiseGain).connect(ac.destination)
    noise.start(t)
    noise.stop(t + 0.32)

    // settle — soft low thump as cards land with the winner
    const thud = ac.createOscillator()
    const thudGain = ac.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(130, t + 0.05)
    thud.frequency.exponentialRampToValueAtTime(75, t + 0.24)
    env(thudGain.gain, 0.22, 0.01, 0.18, t + 0.05)
    thud.connect(thudGain).connect(ac.destination)
    thud.start(t + 0.05)
    thud.stop(t + 0.3)
  })
}

/**
 * Soft two-note chime when it becomes your turn — brighter than the card
 * tap, still muted so it nudges without nagging.
 */
export const playYourTurnSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01
    const notes = [
      { freq: 523.25, at: 0, peak: 0.14 }, // C5
      { freq: 659.25, at: 0.09, peak: 0.12 }, // E5
    ]

    for (const note of notes) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      const filter = ac.createBiquadFilter()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, t + note.at)
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1800, t + note.at)
      env(gain.gain, note.peak, 0.008, 0.16, t + note.at)
      osc.connect(filter).connect(gain).connect(ac.destination)
      osc.start(t + note.at)
      osc.stop(t + note.at + 0.2)
    }
  })
}
