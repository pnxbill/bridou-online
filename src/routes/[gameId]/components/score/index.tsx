import { useBrowserVisibleTask$, useClientEffect$, useSignal, useStylesScoped$ } from '@builder.io/qwik';
import type { QRL } from '@builder.io/qwik'
import { component$ } from '@builder.io/qwik';
import type { TPlayer } from '../../../../../game-server/src/types';
import styles from './styles.css?inline'

interface Props {
  players: TPlayer[]
  onClick?: QRL<() => void>
}

// Room creator will receive onClick prop that will handle the close
// scoreboard button that appears five seconds after the scoreboard is shown
export default component$(({ players, onClick }: Props) => {
  if (!players) return null
  useStylesScoped$(styles)
  const showCloseButton = useSignal(false)

  useBrowserVisibleTask$(() => {
    setTimeout(() => {
      showCloseButton.value = true
    }, 5000)
  })
  


  return (
    <div class="scoreboard-container">
      <ul>
        {players.map(player => <li><span>{player.name}</span> <span>{player.totalPoints}</span></li>)}
      </ul>
      {onClick && showCloseButton.value && <button class="btn" onClick$={onClick}>FECHAR</button>}
    </div>
  );
});

