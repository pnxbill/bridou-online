import { useStylesScoped$ } from '@builder.io/qwik';
import type { QRL } from '@builder.io/qwik'
import { component$ } from '@builder.io/qwik';
import styles from './styles.css?inline'

export interface TCard {
  value: string
  disabled: boolean
}

interface Props {
  cards: TCard[]
  onClick: QRL<(card: TCard) => void>
}

export default component$(({ cards, onClick }: Props) => {
  useStylesScoped$(styles)
  if (!cards?.length) return null  

  return (
    <div class="hand hhand-compact livre">
      {cards.sort((a, b) => {
          if (a.disabled && b.disabled) return 1
          if (a.disabled && !b.disabled) return -1
          return 1
        }).map(((card, i) => (
          <button 
            class="card-btn"
            style={{ zIndex: i }}
            disabled={card.disabled}
          >
            <img class='card' src={`/cards/${card.value}.svg`} onClick$={() => onClick(card)}/>
          </button>
        )
      ))}
    </div>
  );
});

