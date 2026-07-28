'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import { unlockGameAudio } from '@/features/game/sounds'
import { useAmbience } from './ambience-settings'
import { useDeckTheme, type DeckVariant } from './deck-theme'
import { useHandOrder, type HandOrderPrefs } from './hand-order'
import { useSoundSettings } from './sound-settings'
import styles from './SettingsSections.module.css'

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
 * The app preferences — deck face, hand ordering, sound. Rendered inside the
 * header's menu panel; it owns its controls, not the panel around them.
 */
export function SettingsSections() {
  const { variant, setVariant } = useDeckTheme()
  const { muted, setMuted } = useSoundSettings()
  const { enabled: ambience, setEnabled: setAmbience } = useAmbience()
  const { prefs, setPrefs } = useHandOrder()

  return (
    <>
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

      {/* Room tone. Pointless while everything is muted, so it hides. */}
      {!muted && (
        <button
          type="button"
          className={`${styles.toggle} ${ambience ? styles.toggleActive : ''}`}
          onClick={() => {
            unlockGameAudio()
            setAmbience(!ambience)
          }}
          aria-pressed={ambience}
        >
          <span className={styles.toggleIcon} aria-hidden>
            🕯️
          </span>
          <span className={styles.toggleLabel}>
            {ambience ? 'Ambiente ligado' : 'Som ambiente'}
          </span>
        </button>
      )}
    </>
  )
}
