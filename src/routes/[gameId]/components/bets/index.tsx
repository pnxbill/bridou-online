import { component$ } from '@builder.io/qwik';
import { TGame } from '../../../../../types';

export interface TCard {
  value: string
  disabled: boolean
}

interface Props {
  players: TGame['currentRound']['players']
}

export default component$(({ players }: Props) => {
  if (!players?.length) return null
  

  return (
    <div class="bets-container">
      <ul>
        {players.map(player => {
          return (
            <li>
              <span>{player.name}</span>
              <span>{player.bet}</span>
            </li>
          )
        })}
      </ul>
    </div>
  );
});

