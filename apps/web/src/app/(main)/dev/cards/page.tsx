'use client'

/**
 * Dev-only visual playground for the card components — no auth, no server.
 * Handy for judging disabled/playable treatments and hand behavior.
 */
import { Card } from '@bridou/cards-ui'
import type { HandCard } from '@bridou/shared'
import { useState } from 'react'
import { PlayerHand } from '@/features/game/components/PlayerHand'
import { parseCard } from '@/features/game/cards'

const MIXED_HAND: HandCard[] = [
  { value: '3-♠️', disabled: false },
  { value: 'K-♠️', disabled: false },
  { value: '5-♥️', disabled: true },
  { value: 'A-♦️', disabled: true },
  { value: '9-♠️', disabled: false },
  { value: 'Q-♣️', disabled: true },
  { value: '7-♥️', disabled: true },
]

export default function CardsDevPage() {
  const [allDisabled, setAllDisabled] = useState(false)
  const [lastPlayed, setLastPlayed] = useState<string | null>(null)

  const hand = MIXED_HAND.map((c) => (allDisabled ? { ...c, disabled: true } : c))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingTop: '1rem' }}>
      <section>
        <h2 style={{ marginBottom: '1rem' }}>Loose cards (table / trunfo context — no glow)</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Card id="a" {...parseCard('A-♠️')} variant="dark" />
          <Card id="b" {...parseCard('10-♥️')} variant="dark" />
          <Card id="c" {...parseCard('Q-♣️')} variant="dark" disabled />
          <Card id="d" rank="A" suit="spades" faceUp={false} variant="dark" />
        </div>
      </section>

      <section>
        <h2>
          Hand — playable cards glow, blocked cards sink{' '}
          <button className="btn small" onClick={() => setAllDisabled((v) => !v)}>
            {allDisabled ? 'meu turno' : 'turno de outro'}
          </button>
        </h2>
        <p className="hint" style={{ padding: '0.5rem 0', textAlign: 'left' }}>
          {lastPlayed ? `Jogou: ${lastPlayed}` : 'Toque para selecionar, toque de novo para jogar.'}
        </p>
        <div className="table" style={{ minHeight: 260 }}>
          <PlayerHand cards={hand} trunfo="A-♠️" onPlay={(card) => setLastPlayed(card.value)} />
        </div>
      </section>
    </div>
  )
}
