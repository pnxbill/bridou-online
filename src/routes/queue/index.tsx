import {
  $,
  component$,
  Resource,
  useVisibleTask$,
  useContext,
  useStore,
} from '@builder.io/qwik';
import { loader$ } from '@builder.io/qwik-city';
import type { DocumentHead } from '@builder.io/qwik-city';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ConfigContext, UserContext } from '~/context';
import type { TConfig, User } from '~/context';
import { getCookie } from '~/utils/cookie';
import PlayerList from '../../components/playerList';
import { useNavigate } from '@builder.io/qwik-city';

export const getQueueData = loader$(async () => {
  try {
    const res = await axios.get('/api/queue');
    return res.data;
  } catch (err) {
    console.log('err', err);
    if (axios.isAxiosError(err) && err.response) {
      return err.response.data.message;
    }
  }
});

interface TQueuePlayer {
  name: string;
  id: string;
}

interface TResponse {
  message: string;
  leaderId?: string;
  queue: TQueuePlayer[];
  queueId: string;
}

export default component$(() => {
  const nav = useNavigate();
  const { id, isGM } = useContext<User>(UserContext);
  const { IP = '' } = useContext<TConfig>(ConfigContext);
  const data = getQueueData();
  const game = useStore<{
    id: TResponse['queueId'];
    queue: TResponse['queue'];
  }>({
    queue: data.value?.queue,
    id: data.value.queueId,
  });

  const handleStart = $(() => {
    axios.get('/api/start-game');
  });

  useVisibleTask$(() => {
    if (game.id) {
      const socket = io(IP, {
        auth: {
          gameId: game.id,
          playerId: getCookie('uid'),
        },
      });

      socket.on('player-entered-queue', (res) => {
        game.queue = [...game.queue, res];
      });
      socket.on('game-started', () => {
        nav(`/${game.id}`);
      });
    }
  });

  return (
    <div>
      <Resource
        value={data}
        onResolved={(res) => {
          if (typeof res === 'string') return <h1>{res}</h1>;

          const canStartGame = isGM || res?.leaderId === id;

          return (
            <>
              <div id="game-stats">
                <h1>Jogadores na fila:</h1>
                <PlayerList players={game.queue} />
                {canStartGame && (
                  <button
                    class="btn"
                    style={{ margin: 'auto' }}
                    onClick$={handleStart}
                  >
                    START
                  </button>
                )}
              </div>
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
