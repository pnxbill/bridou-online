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
import styles from './styles.css?inline';
import Bets from './components/bets';
import Trunfo from './components/trunfo';
import type { TPlayer, TTurn } from '../../../game-server/src/types';
import Table from './components/table';
import Score from './components/score';
import setGameListeners from './connection/setGameListeners';
import { TRound } from './models';

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

export default component$(() => {
  useStylesScoped$(styles);
  const { id, loading, isGM } = useContext<User>(UserContext)
  const data = useEndpoint<typeof onGet>()
  const loaded = useSignal(false)
  const loc = useLocation()
  const score = useSignal<TPlayer[] | null>(null)
  const round = useStore<TRound>({
    trunfo: '',
    players: [],
    playedCards: [],
    turns: [],
    numOfCards: 0 as TGame['currentRound']['cardsForEachPlayer'],
    cards: [],
    betAvailable: []
  })

  // eslint-disable-next-line qwik/single-jsx-root
  if (loading) return <h1>Carregando...</h1>
  // eslint-disable-next-line qwik/single-jsx-root
  if (!id) return <h1>Favor logar acima</h1>

  const setState = $((game: TGame) => {
    if (!game) return
    round.cards = game.playableCards
    score.value = game.scoreboardShowing ? game.scoreboard : null
    round.trunfo = game.currentRound.trunfo
    round.players = game.currentRound.players
    round.numOfCards = game.currentRound.cardsForEachPlayer
    round.whoMade = game.currentRound.whoMade
    round.playedCards =  game.currentRound.currentTurn?.playedCards || []
    round.currentTurn = game.currentRound.currentTurn
    round.turns = game.currentRound.turns
    round.betAvailable = game.availableBets
  })

  useClientEffect$(() => {
    const socket = io(BASE_URL, {
      auth: {
        gameId: loc.params.gameId,
        playerId: id
      }
    });

    socket.on("disconnect", async (reason) => {
      console.log(`disconnect reason: ${reason}`)
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

    setGameListeners(socket, round)

    socket.on('scoreboard', (res: TPlayer[]) => {
      score.value = res
    })

    socket.on('close-scoreboard', () => {
      if (score.value) score.value = null
    })
  })

  const playCard = $((card: TCard) => {
    if (card.disabled) return
    const cardsCopy = [...round.cards]
    round.cards = round.cards.filter((c: TCard) => c.value !== card.value).map(c => ({...c, disabled: true }))

    axios.post('/api/play-card', {
      gameId: loc.params.gameId,
      playerId: id,
      card: card.value
    }).catch(() => {
      round.cards = cardsCopy
    })
  })

  const playBet = $((bet: number) => {
    const betAvailableCopy = [...round.betAvailable]
    round.betAvailable = []
    axios.post('/api/bet', {
      gameId: loc.params.gameId,
      playerId: id,
      bet,
    }).catch(() => {
      round.betAvailable = betAvailableCopy
    })
  })

  const closeScoreboard = $(() => {
    axios.get(`/api/close-score?gameId=${loc.params.gameId}`)
    score.value = null
  })

  data.value.then(game => {
    if (loaded.value) return
    loaded.value = true
    setState(game)
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
          const currentBettingPlayer = round.players.find(p => (p.bet === null) || p.bet === undefined)

          return (
            <>
              <div id="status-bar">
                <Bets players={round.players} />
                <Trunfo value={round.trunfo} />
              </div>
              <div class="table-container">
                  {round.betAvailable.length > 0 ?
                    <div class="bet-container">
                      {round.betAvailable.map(b => {
                        return <button class="btn bet-btn" onClick$={() => playBet(b)}>{b}</button>
                      })}
                    </div> : currentBettingPlayer ?
                    <div class="current-betting"><span>{currentBettingPlayer?.name}</span>&nbsp; pedindo</div> : null
                  }
                  <Table 
                    playedCards={round.playedCards}
                    currentTurn={round.turns.length + 1}
                    maxTurns={round.numOfCards}
                    players={round.currentTurn?.players || []}
                  />
              </div>
              
              <Hand cards={round.cards} onClick={playCard} />
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
