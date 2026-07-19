'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import { useEffect, useRef, useState } from 'react'
import { unlockGameAudio } from '@/features/game/sounds'
import { useDeckTheme, type DeckVariant } from './deck-theme'
import { useHandOrder, type HandOrderPrefs } from './hand-order'
import { useSoundSettings } from './sound-settings'
import styles from './SettingsCog.module.css'

const OPTIONS: Array<{ value: DeckVariant; label: string }> = [
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' },
]

const HAND_ORDER_TOGGLES: Array<{ key: keyof HandOrderPrefs; icon: string; label: string }> = [
  { key: 'bySuit', icon: '♠♠', label: 'Agrupar por naipe' },
  { key: 'byStrength', icon: '↑', label: 'Ordenar por força' },
  { key: 'trumpsLast', icon: '★', label: 'Trunfos no fim' },
]

/**
 * App settings — deck face color + sound mute. Fixed top-left so it stays
 * reachable on home, lobby and the table without fighting the HUD.
 */
export function SettingsCog() {
  const { variant, setVariant } = useDeckTheme()
  const { muted, setMuted } = useSoundSettings()
  const { prefs, setPrefs } = useHandOrder()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.cog} ${open ? styles.cogOpen : ''}`}
        aria-label="Configurações"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Configurações">
          <p className={styles.heading}>Baralho</p>
          <div className={styles.options}>
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.option} ${variant === opt.value ? styles.optionActive : ''}`}
                onClick={() => setVariant(opt.value)}
                aria-pressed={variant === opt.value}
              >
                <span className={styles.preview}>
                  <PlayingCard id={`preview-${opt.value}`} rank="A" suit="spades" variant={opt.value} />
                </span>
                <span className={styles.optionLabel}>{opt.label}</span>
              </button>
            ))}
          </div>

          <p className={`${styles.heading} ${styles.headingSpaced}`}>Organizar cartas</p>
          <div className={styles.toggleGroup}>
            {HAND_ORDER_TOGGLES.map((toggle) => (
              <button
                key={toggle.key}
                type="button"
                className={`${styles.toggle} ${prefs[toggle.key] ? styles.toggleActive : ''}`}
                onClick={() => setPrefs({ ...prefs, [toggle.key]: !prefs[toggle.key] })}
                aria-pressed={prefs[toggle.key]}
              >
                <span className={styles.toggleIcon} aria-hidden>
                  {toggle.icon}
                </span>
                <span className={styles.toggleLabel}>{toggle.label}</span>
              </button>
            ))}
          </div>
          <p className={styles.hint}>Aplicado quando as cartas são dadas</p>

          <p className={`${styles.heading} ${styles.headingSpaced}`}>Som</p>
          <button
            type="button"
            className={`${styles.toggle} ${muted ? styles.toggleActive : ''}`}
            onClick={() => {
              unlockGameAudio()
              setMuted(!muted)
            }}
            aria-pressed={muted}
          >
            <span className={styles.toggleIcon} aria-hidden>
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M11 5 6 9H3v6h3l5 4V5Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m16 9 6 6M22 9l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M11 5 6 9H3v6h3l5 4V5Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            <span className={styles.toggleLabel}>{muted ? 'Sons mutados' : 'Sons ligados'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
