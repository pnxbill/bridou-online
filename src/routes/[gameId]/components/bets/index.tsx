import { component$, useStylesScoped$ } from '@builder.io/qwik';
import { TGame } from '../../../../../types';
import styles from './styles.css?inline'

export interface TCard {
  value: string
  disabled: boolean
}

interface Props {
  players: TGame['currentRound']['players']
}

export default component$(({ players }: Props) => {
  useStylesScoped$(styles);
  if (!players?.length) return null
  
  return (
    <div class="bets-container">
      <ul>
        {/* {players.concat(players).concat(players).concat(players[0]).map(player => { */}
        {players.map(player => {
          return (
            <li>
              <span>
                <img src={player.photoURL} />
                {player.name}
              </span>
              <span>{player.bet}</span>
            </li>
          )
        })}
      </ul>
    </div>
  );
});

