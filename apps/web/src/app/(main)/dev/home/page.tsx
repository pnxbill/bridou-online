'use client'

/**
 * Dev-only mockup of the home/login entrance — fake data, no server.
 * The 5-second first impression: night sky, a fan of cards, the table
 * rim rising from the bottom, one action in the thumb zone.
 */
import { Card as PlayingCard } from '@bridou/cards-ui'
import { useState } from 'react'
import { parseCard } from '@/features/game/cards'
import styles from './home.module.css'

const FAN = ['K-♥️', 'Q-♣️', 'A-♠️', 'J-♦️', '7-♥️']

/* Ambient suit glyphs drifting in the night sky. */
const SUITS: Array<{ glyph: string; top: string; left: string; delay: string; gold?: boolean }> = [
  { glyph: '♠', top: '12%', left: '12%', delay: '0s' },
  { glyph: '♥', top: '20%', left: '82%', delay: '1.5s', gold: true },
  { glyph: '♦', top: '38%', left: '8%', delay: '3s', gold: true },
  { glyph: '♣', top: '46%', left: '88%', delay: '4.5s' },
  { glyph: '♠', top: '8%', left: '60%', delay: '6s' },
]

const MODES = ['visitante', 'logado', 'jogo ativo'] as const
type Mode = (typeof MODES)[number]

const GoogleG = () => (
  <span className={styles.googleBadge}>
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  </span>
)

export default function HomeMockupPage() {
  const [mode, setMode] = useState<Mode>('visitante')

  return (
    <div className={styles.screen}>
      {SUITS.map((s, i) => (
        <span
          key={i}
          className={`${styles.suit} ${s.gold ? styles.suitGold : ''}`}
          style={{ top: s.top, left: s.left, animationDelay: s.delay }}
        >
          {s.glyph}
        </span>
      ))}

      {mode !== 'visitante' && (
        <div className={styles.greeting}>
          <span className={styles.greetingAvatar}>AN</span>
          Ana
        </div>
      )}

      <div className={styles.brand}>
        <h1 className={styles.wordmark}>BRIDOU</h1>
        <span className={styles.tagline}>noite de jogo</span>
      </div>

      <div className={styles.fan}>
        {FAN.map((value, i) => (
          <div
            key={value}
            className={styles.fanCard}
            style={
              {
                '--rot': `${(i - 2) * 13}deg`,
                '--lift': `${Math.abs(i - 2) * 6}px`,
                '--delay': `${0.15 + i * 0.09}s`,
                zIndex: 5 - Math.abs(i - 2), // ace peaks at the center

              } as React.CSSProperties
            }
          >
            <PlayingCard id={value} {...parseCard(value)} variant="dark" />
          </div>
        ))}
      </div>

      <div className={styles.feltRim} />

      <div className={styles.actions}>
        {mode === 'visitante' && (
          <>
            <button className={styles.action}>
              <GoogleG />
              Entrar com Google
            </button>
            <span className={styles.hint}>entre para sentar na mesa</span>
          </>
        )}
        {mode === 'logado' && (
          <>
            <button className={`${styles.action} ${styles.actionPrimary}`}>Sentar na mesa</button>
            <span className={styles.hint}>a mesa está aberta</span>
          </>
        )}
        {mode === 'jogo ativo' && (
          <>
            <button className={`${styles.action} ${styles.actionPrimary}`}>Voltar ao jogo</button>
            <button className={styles.action}>Sentar na mesa</button>
          </>
        )}
      </div>

      <button
        className={styles.devToggle}
        onClick={() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length] ?? MODES[0])}
      >
        estado: {mode}
      </button>
    </div>
  )
}
