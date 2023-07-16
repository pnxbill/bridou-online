import { useStylesScoped$ } from '@builder.io/qwik';
import { component$ } from '@builder.io/qwik';
import type Game from '../../../../../../game-server/src/game';
import type { TPlayer } from '../../../../../../game-server/src/types';
import styles from './styles.css?inline';

export interface TCard {
  value: string;
  disabled: boolean;
}

interface Props {
  playedCards: string[];
  currentTurn: number;
  players: TPlayer[];
  maxTurns: Game['currentRound']['cardsForEachPlayer'];
}

export default component$(
  ({ playedCards, currentTurn, maxTurns, players }: Props) => {
    useStylesScoped$(styles);
    const hasTurnFinished = playedCards.length === players.length;
    const nextPlayerIndex = hasTurnFinished ? 0 : playedCards.length;

    return (
      <>
        <div class="turn">
          {currentTurn}/{maxTurns}
        </div>
        <div class="table">
          <div class="hhand-compact">
            {playedCards.map((card, i) => {
              return (
                <>
                  <img class="card" src={`/cards/${card}.svg`} />
                  {players && (
                    <img
                      class="player-pic"
                      style={{ marginLeft: `calc(30px + ${46 * i}px)` }}
                      src={players[i]?.photoURL}
                    />
                  )}
                </>
              );
            })}
            {!hasTurnFinished && (
              <img
                class="player-pic current"
                style={{
                  marginLeft: `calc(30px + ${46 * playedCards.length}px)`,
                }}
                src={players[nextPlayerIndex]?.photoURL}
              />
            )}
          </div>
        </div>
      </>
    );
  }
);
