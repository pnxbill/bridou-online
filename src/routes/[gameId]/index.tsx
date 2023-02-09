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
import Hand from './components/hand';
import { io } from "socket.io-client";
import { getCookie } from '~/utils/cookie';
import styles from './styles.css?inline';
import Bets from './components/bets';
import Trunfo from './components/trunfo';
import type { TNumOfBet, TPlayer, TTurn } from '../../../game-server/src/types';
import Table from './components/table';
import Score from './components/score';

// This code runs in the Server
export const onGet: RequestHandler<TGame> = async ({ params: { gameId }, cookie, response }) => {
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

interface TRound {
  trunfo: string
  players: TGame['currentRound']['players']
  bailadores?: TGame['currentRound']['bailadores']
  playedCards: string[]
  numOfCards: TGame['currentRound']['cardsForEachPlayer']
  whoMade?: TGame['currentRound']['whoMade']
  turns: TTurn[]
  currentTurn?: TTurn
}


export default component$(() => {
  useStylesScoped$(styles);
  const { id, loading, isGM } = useContext<User>(UserContext)
  const data = useEndpoint<typeof onGet>()
  const loaded = useSignal(false)
  const loc = useLocation()
  const cards = useSignal<TCard[]>([])
  const betAvailable = useSignal<number[]>([])
  const score = useSignal<TPlayer[] | null>(null)
  const round = useStore<TRound>({
    trunfo: '',
    players: [],
    playedCards: [],
    turns: [],
    numOfCards: 0 as TGame['currentRound']['cardsForEachPlayer']
  })

  // eslint-disable-next-line qwik/single-jsx-root
  if (loading) return <h1>Carregando...</h1>
  // eslint-disable-next-line qwik/single-jsx-root
  if (!id) return <h1>Favor logar acima</h1>

  const setState = $((game: TGame) => {
    if (!game) return
    cards.value = game.playableCards
    score.value = game.scoreboardShowing ? game.scoreboard : null
    round.trunfo = game.currentRound.trunfo
    round.players = game.currentRound.players
    round.numOfCards = game.currentRound.cardsForEachPlayer
    round.whoMade = game.currentRound.whoMade
    round.playedCards =  game.currentRound.currentTurn?.playedCards || []
    round.currentTurn = game.currentRound.currentTurn
    round.turns = game.currentRound.turns
    
    if ((game.players[0].id === getCookie('uid')) && (game.currentRoundNumber === 1)) betAvailable.value = [0, 1]
    else betAvailable.value = game.availableBets
  })

  useClientEffect$(() => {
    const socket = io(BASE_URL, {
      auth: {
        gameId: loc.params.gameId,
        playerId: id
      }
    });

    socket.on("disconnect", async (reason) => {
      try {
        const res = await axios.post('/api/enter-game', {
          gameId: loc.params.gameId,
          playerId: id
        })
        setState(res.data.game)
      } catch(err: unknown) {
        if (axios.isAxiosError(err) && err.response) {
          console.error(err.response.data.message)
        }
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
      console.log('received playtime', res)
    })

    socket.on('bet-time', (res: number[]) => {     
      console.log('receveid bet-time', res) 
      betAvailable.value = res
    })

    socket.on('player-bet', (res: {id: string, bet: TNumOfBet}) => {
      round.players = round.players.map(p => p.id === res.id ? ({...p, bet: res.bet }) : p)
    })

    socket.on('player-play', (res: string[]) => {
      round.playedCards = res
    })

    socket.on('turn-ended', (res: TTurn) => {
      round.currentTurn = res
    })

    socket.on('turn-started', (res: TTurn) => {
      round.currentTurn = res
    })

    socket.on('set-trunfo', (res: string) => {
      round.trunfo = res
    })

    socket.on('round-ended', (res: TGame['currentRound']['bailadores']) => {
      round.bailadores = res
      round.playedCards = []
    })

    socket.on('round-started', (res: TGame['currentRound']) => {
      round.trunfo = res.trunfo
      round.players = res.players
    })

    socket.on('scoreboard', (res: TPlayer[]) => {
      score.value = res
    })

    socket.on('close-scoreboard', () => {
      if (score.value) score.value = null
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

  const closeScoreboard = $(() => {
    axios.get(`/api/close-score?gameId=${loc.params.gameId}`)
    score.value = null
  })

  data.value.then(d => {
    if (loaded.value) return
    loaded.value = true
    setState(d)    
  })
 
  return (
    <div class="game-page">
      <Resource
        value={data}
        onResolved={(game) => {
          // eslint-disable-next-line qwik/single-jsx-root
          if (typeof game === 'string') return <h1>{game}</h1>

          if (score.value) return (
            <Score
              players={score.value}
              onClick={(isGM || game.leaderId === id) ? closeScoreboard : undefined}
            />
          )

          return (
            <>
              <div id="status-bar">
                <Bets players={round.players} />
                <Trunfo value={round.trunfo} />
              </div>
              <div class="bet-container">
                {betAvailable.value.length > 0 && 
                  betAvailable.value.map(b => {
                    return <button class="btn bet-btn" onClick$={() => playBet(b)}>{b}</button>
                  })
                }
              </div>
              {!!round.currentTurn && 
                <Table playedCards={round.playedCards} currentTurn={round.turns.length + 1} maxTurns={round.numOfCards} players={round.currentTurn?.players}/>}
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
