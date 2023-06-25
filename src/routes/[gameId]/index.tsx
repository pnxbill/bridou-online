import {
  $,
  component$,
  Resource,
  useVisibleTask$,
  useContext,
  useSignal,
  useStore,
  useStylesScoped$,
} from '@builder.io/qwik';
import { loader$ } from '@builder.io/qwik-city';
import type { DocumentHead } from '@builder.io/qwik-city';
import { useLocation } from '@builder.io/qwik-city';
import axios from 'axios';
import { ConfigContext, UserContext } from '~/context';
import type { TConfig, User } from '~/context';
import type { TCard } from '~/components/hand';
import Hand from './components/hand';
import { io } from 'socket.io-client';
import styles from './styles.css?inline';
import Bets from './components/bets';
import Trunfo from './components/trunfo';
import type { TPlayer } from '../../../game-server/src/types';
import Table from './components/table';
import Score from './components/score';
import setGameListeners from './connection/setGameListeners';
import type { TRound } from './models';
import setState from './connection/setState';
import BailadoresList from './components/bailadoresList';

// This code runs in the Server
export const getGameData = loader$(async (_) => {
  const { cookie, params, redirect } = _;
  const playerId = cookie.get('uid')?.value;
  if (!playerId) {
    throw redirect(301, '/');
  }
  try {
    const res = await axios.post('/api/enter-game', {
      gameId: params.gameId,
      playerId,
    });
    return res.data.game;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      return err.response.data.message;
    }
  }
});

export default component$(() => {
  useStylesScoped$(styles);
  const { id, loading, isGM } = useContext<User>(UserContext);
  const { IP = '' } = useContext<TConfig>(ConfigContext);
  const game = getGameData();
  if (game.value === 'Game not found') return <h1>{game.value}</h1>;
  const loc = useLocation();
  const score = useSignal<TPlayer[] | null>(
    game.value.scoreboardShowing ? game.value.scoreboard : null
  );
  const round = useStore<TRound>(() => {
    const { score: _score, ...round } = setState(game.value);
    score.value = _score;
    return round;
  });

  if (loading) return <h1>Carregando...</h1>;
  if (!id) return <h1>Favor logar acima</h1>;

  useVisibleTask$(() => {
    const socket = io(IP, {
      auth: {
        gameId: loc.params.gameId,
        playerId: id,
      },
    });

    socket.on('disconnect', async (reason) => {
      console.log(`disconnect reason: ${reason}`);
      try {
        const res = await axios.post('/api/enter-game', {
          gameId: loc.params.gameId,
          playerId: id,
        });
        const { score: _score, ...round } = res.data.game;
        score.value = _score;
        setState(round);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          console.error(err.response.data.message);
        }
      }
    });

    socket.on('scoreboard', (res: TPlayer[]) => {
      round.bailadores = [];
      score.value = res;
    });

    socket.on('close-scoreboard', () => {
      if (score.value) score.value = null;
    });

    setGameListeners(socket, round);
  });

  const playCard = $((card: TCard) => {
    if (card.disabled) return;
    const cardsCopy = [...round.cards];
    round.cards = round.cards
      .filter((c: TCard) => c.value !== card.value)
      .map((c) => ({ ...c, disabled: true }));

    axios
      .post('/api/play-card', {
        gameId: loc.params.gameId,
        playerId: id,
        card: card.value,
      })
      .catch(() => {
        round.cards = cardsCopy;
      });
  });

  const playBet = $((bet: number) => {
    const betAvailableCopy = [...round.betAvailable];
    round.betAvailable = [];
    axios
      .post('/api/bet', {
        gameId: loc.params.gameId,
        playerId: id,
        bet,
      })
      .catch(() => {
        round.betAvailable = betAvailableCopy;
      });
  });

  const closeScoreboard = $(() => {
    axios.get(`/api/close-score?gameId=${loc.params.gameId}`);
    score.value = null;
  });

  return (
    <div class="game-page">
      <Resource
        value={game}
        onResolved={(result) => {
          if (round.bailadores?.length)
            return <BailadoresList players={round.bailadores} />;

          if (score.value)
            return (
              <Score
                players={score.value}
                onClick={
                  isGM || result.leaderId === id ? closeScoreboard : undefined
                }
              />
            );
          const currentBettingPlayer = round.players.find(
            (p) => p.bet === null || p.bet === undefined
          );

          return (
            <>
              <div id="status-bar">
                <Bets players={round.players} />
                <Trunfo value={round.trunfo} />
              </div>
              <div class="table-container">
                {round.betAvailable.length > 0 ? (
                  <div class="bet-container">
                    {round.betAvailable.map((b) => {
                      return (
                        <button class="btn bet-btn" onClick$={() => playBet(b)}>
                          {b}
                        </button>
                      );
                    })}
                  </div>
                ) : currentBettingPlayer ? (
                  <div class="current-betting">
                    <span>{currentBettingPlayer?.name}</span>&nbsp; pedindo
                  </div>
                ) : null}
                <Table
                  playedCards={round.playedCards}
                  currentTurn={round.turns.length + 1}
                  maxTurns={round.numOfCards}
                  players={round.currentTurn?.players || []}
                />
              </div>

              <Hand cards={round.cards} onClick={playCard} />
            </>
          );
        }}
        onRejected={(err) => <h1>{err}</h1>}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Bridou Online',
  meta: [
    {
      name: 'description',
      content: 'Bridou online',
    },
  ],
};
