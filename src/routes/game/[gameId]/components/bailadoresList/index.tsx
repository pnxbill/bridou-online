import { useStylesScoped$ } from '@builder.io/qwik';
import { component$ } from '@builder.io/qwik';
import type { TPlayer } from '../../../../../../game-server/src/types';
import styles from './styles.css?inline';

interface Props {
  players: TPlayer[];
}

export default component$(({ players }: Props) => {
  if (!players) return null;
  useStylesScoped$(styles);

  return (
    <div class="bailadores-container">
      <h3>Bailadores:</h3>
      <ul>
        {players.map((player) => (
          <li>
            <span>{player.name}</span>{' '}
            <span>
              {player.bet}/{player.made}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});
