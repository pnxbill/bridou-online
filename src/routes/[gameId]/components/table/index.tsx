import { QRL, useSignal, useStylesScoped$ } from '@builder.io/qwik';
import { component$ } from '@builder.io/qwik';
import Game from '../../../../../game-server/src/game';
import Turn from '../../../../../game-server/src/game/turn';
import { TPlayer } from '../../../../../game-server/src/types';
import styles from './styles.css?inline'

export interface TCard {
  value: string
  disabled: boolean
}

interface Props {
  playedCards: string[]
  currentTurn: number
  players?: TPlayer[]
  maxTurns: Game['currentRound']['cardsForEachPlayer']
}

export default component$(({ playedCards, currentTurn, maxTurns, players }: Props) => {
  useStylesScoped$(styles)
  // const 
  // const turnIndex = useSignal(currentTurn)
  

  return (
    <div class="table-container">
      <div class="turn">{currentTurn}/{maxTurns}</div>
      <div class="table">
        <div class="hhand-compact">
          {playedCards.map((card, i) => {
            return (
              <>
                <img class='card' src={`/cards/${card}.svg`} />
                {players && <img class='player-pic' style={{marginLeft: `calc(30px + ${46 * i}px)`}} src={players[i].photoURL} />}
              </>
            )
          })}
        </div>
        {/* <div class="who-made-list">
          {players && }
        </div> */}
      </div>
    </div>
  );
});

