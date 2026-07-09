'use client'

/**
 * Vendored from github.com/pnxbill/cards-lib @ 47bc27c.
 * Local changes: 'use client' directive; `disabled` prop. Instead of dimming
 * (which muddies this deck's dark gradient), playable cards (clickable and
 * not disabled) get a gold glow matching the card back's accent, while
 * disabled cards stay crisp but inert.
 */
import React from 'react'

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface CardProps {
  id: string
  suit: Suit
  rank: Rank
  faceUp?: boolean
  /** Unplayable right now: dimmed and not clickable (still draggable in a Hand). */
  disabled?: boolean
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
  variant?: 'light' | 'dark'
}

const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const suitColors: Record<Suit, string> = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
}

export const Card: React.FC<CardProps> = ({
  suit,
  rank,
  faceUp = true,
  disabled = false,
  onClick,
  className = '',
  style,
  variant = 'light',
}) => {
  const isDark = variant === 'dark'
  const baseColor = suitColors[suit]

  let finalColor = baseColor
  if (isDark) {
    if (baseColor === 'black') {
      finalColor = '#e2e8f0' // Soft slate for black suits in dark mode
    } else {
      finalColor = '#fca5a5' // Soft coral red
    }
  } else {
    // Light mode premium colors
    if (baseColor === 'black') {
      finalColor = '#1e293b' // Slate 800
    } else {
      finalColor = '#dc2626' // Red 600
    }
  }

  const handleClick = disabled ? undefined : onClick
  // Playable = actionable right now → gold accent glow (same gold as the card back)
  const isPlayable = !disabled && !!onClick

  const restingBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : '#e2e8f0' // Subtle slate border in dark
  const restingShadow = isDark
    ? '0 8px 16px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.1) inset' // Stronger shadow + inner glow
    : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'

  const baseStyles: React.CSSProperties = {
    width: '100px',
    height: '140px',
    backgroundColor: isDark ? '#1e293b' : '#fdfbf7', // Dark slate or warm cream
    background: isDark
      ? 'linear-gradient(135deg, #334155 0%, #1e293b 100%)' // Lighter, more visible gradient
      : 'linear-gradient(135deg, #fffbf0 0%, #f0f0f0 100%)',
    borderRadius: '12px',
    border: `2px solid ${isPlayable ? 'rgba(251, 191, 36, 0.75)' : restingBorder}`,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px',
    boxSizing: 'border-box',
    cursor: handleClick ? 'pointer' : 'default',
    userSelect: 'none',
    boxShadow: isPlayable
      ? `${restingShadow}, 0 0 14px rgba(251, 191, 36, 0.35)`
      : restingShadow,
    color: finalColor,
    position: 'relative',
    fontFamily: '"Outfit", sans-serif', // Use the new font
    transition:
      'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, border-color 0.2s ease',
    ...style,
  }

  const backStyles: React.CSSProperties = {
    ...baseStyles,
    backgroundColor: '#0f172a',
    background: `
      radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%),
      repeating-linear-gradient(45deg, rgba(251, 191, 36, 0.05) 0px, rgba(251, 191, 36, 0.05) 2px, transparent 2px, transparent 8px)
    `,
    border: '2px solid #fbbf24', // Gold border
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  if (!faceUp) {
    return (
      <div className={`card card-back ${className}`} style={backStyles} onClick={handleClick}>
        <div
          style={{
            width: '60%',
            height: '60%',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '1.5rem', opacity: 0.2 }}>♠</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`card card-face ${className}`} style={baseStyles} onClick={handleClick}>
      {/* Top Left Corner */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: '1',
        }}
      >
        <div style={{ fontSize: '1.2rem', fontWeight: '700', letterSpacing: '-0.5px' }}>{rank}</div>
        <div style={{ fontSize: '0.9rem', marginTop: '2px' }}>{suitSymbols[suit]}</div>
      </div>

      {/* Center Content */}
      <div
        style={{
          fontSize: '3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 1,
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))',
        }}
      >
        {suitSymbols[suit]}
      </div>

      {/* Bottom Right Corner (Mirrored) */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: '1',
          transform: 'rotate(180deg)',
        }}
      >
        <div style={{ fontSize: '1.2rem', fontWeight: '700', letterSpacing: '-0.5px' }}>{rank}</div>
        <div style={{ fontSize: '0.9rem', marginTop: '2px' }}>{suitSymbols[suit]}</div>
      </div>
    </div>
  )
}
