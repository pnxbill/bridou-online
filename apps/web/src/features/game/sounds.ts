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
let muted = false

/** Wired from SoundSettingsProvider — also readable before React mounts. */
export const setSoundsMuted = (value: boolean) => {
  muted = value
}

export const areSoundsMuted = () => muted

// Prefer the stored preference before the settings provider hydrates.
if (typeof window !== 'undefined') {
  try {
    muted = localStorage.getItem('bridou.soundsMuted') === '1'
  } catch {
    // private mode
  }
}

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
  if (muted) return null
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
 * Soft two-note chime when it becomes your turn to play a card — brighter
 * than the card tap, still muted so it nudges without nagging.
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

/**
 * Soft lower chime when it's your turn to bet — warmer/darker than the
 * play-turn cue so the two phases stay distinct.
 */
export const playYourBetTurnSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01
    const notes = [
      { freq: 392.0, at: 0, peak: 0.13 }, // G4
      { freq: 493.88, at: 0.1, peak: 0.11 }, // B4
    ]

    for (const note of notes) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      const filter = ac.createBiquadFilter()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(note.freq, t + note.at)
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1400, t + note.at)
      env(gain.gain, note.peak, 0.01, 0.18, t + note.at)
      osc.connect(filter).connect(gain).connect(ac.destination)
      osc.start(t + note.at)
      osc.stop(t + note.at + 0.22)
    }
  })
}

/**
 * Soft chip-like click when someone places a bet.
 */
export const playBetSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01
    const jitter = 0.94 + Math.random() * 0.12

    // ceramic/chip body
    const click = ac.createOscillator()
    const clickGain = ac.createGain()
    click.type = 'triangle'
    click.frequency.setValueAtTime(880 * jitter, t)
    click.frequency.exponentialRampToValueAtTime(420 * jitter, t + 0.05)
    env(clickGain.gain, 0.16, 0.002, 0.06, t)
    click.connect(clickGain).connect(ac.destination)
    click.start(t)
    click.stop(t + 0.08)

    // tiny surface noise
    const noise = ac.createBufferSource()
    noise.buffer = noiseBuffer(ac, 0.05)
    const filter = ac.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(2000, t)
    const noiseGain = ac.createGain()
    env(noiseGain.gain, 0.08, 0.001, 0.035, t)
    noise.connect(filter).connect(noiseGain).connect(ac.destination)
    noise.start(t)
    noise.stop(t + 0.05)
  })
}

/**
 * Soft card riffle when a hand is dealt — a short burst of felt taps.
 */
export const playDealSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01

    for (let i = 0; i < 5; i++) {
      const at = t + i * 0.045
      const jitter = 0.9 + Math.random() * 0.2

      const noise = ac.createBufferSource()
      noise.buffer = noiseBuffer(ac, 0.06)
      const filter = ac.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime((700 + i * 80) * jitter, at)
      filter.Q.setValueAtTime(0.8, at)
      const noiseGain = ac.createGain()
      env(noiseGain.gain, 0.07, 0.002, 0.04, at)
      noise.connect(filter).connect(noiseGain).connect(ac.destination)
      noise.start(at)
      noise.stop(at + 0.06)

      const thud = ac.createOscillator()
      const thudGain = ac.createGain()
      thud.type = 'sine'
      thud.frequency.setValueAtTime(150 * jitter, at)
      thud.frequency.exponentialRampToValueAtTime(90, at + 0.05)
      env(thudGain.gain, 0.08, 0.002, 0.045, at)
      thud.connect(thudGain).connect(ac.destination)
      thud.start(at)
      thud.stop(at + 0.07)
    }
  })
}

/**
 * Soft accent when a new round opens (trunfo / betting starts).
 */
export const playRoundOpenSound = () => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01

    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const filter = ac.createBiquadFilter()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(330, t)
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.12)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1600, t)
    env(gain.gain, 0.12, 0.015, 0.2, t)
    osc.connect(filter).connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + 0.24)

    const soft = ac.createOscillator()
    const softGain = ac.createGain()
    soft.type = 'triangle'
    soft.frequency.setValueAtTime(660, t + 0.08)
    env(softGain.gain, 0.06, 0.01, 0.14, t + 0.08)
    soft.connect(softGain).connect(ac.destination)
    soft.start(t + 0.08)
    soft.stop(t + 0.26)
  })
}

/**
 * Soft cue when the round-result overlay lands — personal to the listener:
 * `clean` if they made their bet, `bailou` if they missed.
 */
export const playRoundResultSound = (kind: 'clean' | 'bailou' = 'clean') => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01
    const notes =
      kind === 'clean'
        ? [
            { freq: 523.25, at: 0, peak: 0.12 },
            { freq: 659.25, at: 0.08, peak: 0.11 },
            { freq: 783.99, at: 0.16, peak: 0.1 },
          ]
        : [
            { freq: 440, at: 0, peak: 0.12 },
            { freq: 349.23, at: 0.1, peak: 0.11 },
          ]

    for (const note of notes) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      const filter = ac.createBiquadFilter()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, t + note.at)
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(2000, t + note.at)
      env(gain.gain, note.peak, 0.01, 0.22, t + note.at)
      osc.connect(filter).connect(gain).connect(ac.destination)
      osc.start(t + note.at)
      osc.stop(t + note.at + 0.28)
    }
  })
}

/**
 * Soft settle when the scoreboard opens — fuller swell for game end.
 */
export const playScoreboardSound = (final = false) => {
  void ensureRunning().then((ac) => {
    if (!ac) return
    const t = ac.currentTime + 0.01

    const thud = ac.createOscillator()
    const thudGain = ac.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(110, t)
    thud.frequency.exponentialRampToValueAtTime(70, t + 0.2)
    env(thudGain.gain, final ? 0.18 : 0.12, 0.02, 0.22, t)
    thud.connect(thudGain).connect(ac.destination)
    thud.start(t)
    thud.stop(t + 0.28)

    const notes = final
      ? [
          { freq: 392.0, at: 0.06, peak: 0.1 },
          { freq: 523.25, at: 0.14, peak: 0.11 },
          { freq: 659.25, at: 0.22, peak: 0.1 },
        ]
      : [{ freq: 349.23, at: 0.08, peak: 0.09 }]

    for (const note of notes) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(note.freq, t + note.at)
      env(gain.gain, note.peak, 0.015, 0.24, t + note.at)
      osc.connect(gain).connect(ac.destination)
      osc.start(t + note.at)
      osc.stop(t + note.at + 0.3)
    }
  })
}
