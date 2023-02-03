import { $, component$, Resource, useClientEffect$, useContext, useStore } from '@builder.io/qwik';
import type { DocumentHead, RequestHandler} from '@builder.io/qwik-city';
import { useEndpoint } from '@builder.io/qwik-city';
import axios from 'axios';
import { io } from 'socket.io-client';
import type { User} from '~/context';
import { BASE_URL} from '~/context';
import { UserContext } from '~/context';
import { getCookie } from '~/utils/cookie';
import PlayerList from '../../components/playerList'
import { useNavigate } from '@builder.io/qwik-city';

// This code runs in the Server
export const onGet: RequestHandler<TResponse> = async () => {
  try {
    const res = await axios.get('/api/queue')
    return res.data
  } catch(err: unknown) {
    console.log('err', err)
    if (axios.isAxiosError(err) && err.response) {
      return err.response.data.message
    }
  }
};

interface TQueuePlayer {
  name: string
  id: string
}

interface TResponse {
  message: string
  leaderId?: string
  queue: TQueuePlayer[]
  queueId: string
}

export default component$(() => {
  const nav = useNavigate()
  const { id } = useContext<User>(UserContext)
  const data = useEndpoint<typeof onGet>()
  const game = useStore<{id: TResponse['queueId'], queue: TResponse['queue']}>({
    queue: [],
    id: ''
  })

  const handleStart = $(() => {
    axios.get('/api/start-game').then(() => {
      console.log('GAME CREATED',)
    })
  })

  data.value.then(res => {
    game.id = res?.queueId
    if (game?.queue?.length === 0) game.queue = res?.queue
  })

  useClientEffect$(() => {
     if (game.id) {
      const socket = io(BASE_URL, {
        auth: {
          gameId: game.id,
          playerId: getCookie('uid')
        }
      });

      socket.on('player-entered-queue', res => {
        game.queue = [...game.queue, res]
      })
      socket.on('game-started', () => {
        nav.path = `/${game.id}`
      })
    }
  })
  

  return (
    <div>
      <Resource
        value={data}
        onResolved={(res) => {
          // eslint-disable-next-line qwik/single-jsx-root
          if (typeof res === 'string') return <h1>{res}</h1>

          const canStartGame = (id === 'nIrszj4f3Actvh5YmQSev5CQvHz2') || (res?.leaderId === id)
          
          return (
            <>
              <div id="game-stats">
                <h1>Jogadores na fila:</h1>
                <PlayerList players={game.queue} />
                {canStartGame && <button class="btn" style={{ margin: 'auto'}} onClick$={handleStart}>START</button>} 
              </div>
          </>
        )}}
        onRejected={err => <h1>{err}</h1>}
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
