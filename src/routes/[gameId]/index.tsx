import { $, component$, Resource, useClientEffect$, useContext, useSignal, useStore, useStylesScoped$ } from '@builder.io/qwik';
import type { DocumentHead, RequestHandler} from '@builder.io/qwik-city';
import { useLocation} from '@builder.io/qwik-city';
import { useEndpoint } from '@builder.io/qwik-city';
import axios from 'axios';
import type { User} from '~/context';
import { BASE_URL} from '~/context';
import { UserContext } from '~/context';
import type { TGame } from '../../../types'
import type { TCard } from '~/components/hand';
import Hand from '~/components/hand';
import { io } from "socket.io-client";
import { getCookie } from '~/utils/cookie';
import styles from './styles.css?inline';

// This code runs in the Server
export const onGet: RequestHandler<number> = async ({ params: { gameId }, cookie, response }) => {
  const playerId = cookie.get('uid')?.value
  if (!playerId) throw response.redirect('/')

  try {
    const res = await axios.post('/api/enter-game', {
      gameId,
      playerId
    })
    return res.data.game
  } catch(err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      return err.response.data.message
    }
  }
};

export default component$(() => {
  useStylesScoped$(styles);
  const { id, loading } = useContext<User>(UserContext)
  const data = useEndpoint<TGame>()
  const loaded = useSignal(false)
  const loc = useLocation()
  const cards = useSignal<TCard[]>([])
  const betAvailable = useSignal<number[]>([])
  const round = useStore({
    trunfo: ''
  })

  // eslint-disable-next-line qwik/single-jsx-root
  if (loading) return <h1>Carregando...</h1>
  // eslint-disable-next-line qwik/single-jsx-root
  if (!id) return <h1>Favor logar acima</h1>

  

  useClientEffect$(() => {
    const socket = io(BASE_URL, {
      auth: {
        gameId: loc.params.gameId,
        playerId: id
      }
    });

    socket.on('log', res => {
      const el = document.createElement('p')
      el.innerText = res
      const container = document.getElementById('game-stats')
      if (!container) return
      container.appendChild(el)
      container.scrollTop = container.scrollHeight
    })

    socket.on('cards', (res: TCard['value'][]) => {
      cards.value = res.map(r => ({ value: r, disabled: true}))
    })

    socket.on('play-time', (res: TCard[]) => {
      cards.value = res
    })

    socket.on('bet-time', (res: number[]) => {      
      betAvailable.value = res
    })

    socket.on('set-trunfo', (res: string) => {
      round.trunfo = res
    })
  })

  const playCard = $((card: TCard) => {
    if (card.disabled) return
    axios.post('/api/play-card', {
      gameId: loc.params.gameId,
      playerId: id,
      card: card.value
    }).then(() => {
      cards.value = cards.value.filter((c: TCard) => c.value !== card.value).map(c => ({...c, disabled: true}))
    })
  })

  const playBet = $((bet: number) => {
    axios.post('/api/bet', {
      gameId: loc.params.gameId,
      playerId: id,
      bet,
    }).then(() => {
      betAvailable.value = []
    })
  })

  data.value.then(d => {
    if (loaded.value) return
    loaded.value = true
    cards.value = d.playableCards
    round.trunfo = d.currentRound.trunfo
    
    
    if ((d.players[0].id === getCookie('uid')) && (d.currentRoundNumber === 1)) betAvailable.value = [0, 1]
  })
 
  return (
    <div>
      <Resource
        value={data}
        onResolved={(game) => {
          // eslint-disable-next-line qwik/single-jsx-root
          if (typeof game === 'string') return <h1>{game}</h1>

          return (
            <>
              <div id="status-bar">
                <span>
                  #{game.currentRoundNumber}
                </span>
                <span>
                  {round.trunfo && <img class='card' src={`/cards/${round.trunfo}.svg`} />}
                </span>
              </div>
              <div id="game-stats">
                <h1>Round: {game.currentRoundNumber}</h1>
                <h1>N. de cartas: {game.currentRound.cardsForEachPlayer}</h1>
                <ul>
                  {game.players.map(player => (<li>{player.name}</li>))}
                </ul>
                
                
              </div>
              {betAvailable.value.length > 0 && 
                <div style={{ display: 'flex '}}>
                  {betAvailable.value.map(b => {
                    return <button class="bet-btn" onClick$={() => playBet(b)}>{b}</button>
                  })}
                </div>
              }
              <Hand cards={cards.value} onClick={playCard} />
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
