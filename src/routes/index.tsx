import { component$, useContext, $, useSignal } from '@builder.io/qwik';
import type { DocumentHead} from '@builder.io/qwik-city';
import { useNavigate } from '@builder.io/qwik-city';
import axios from 'axios';
import type { User } from '~/context';
import { UserContext } from '~/context';

export default component$(() => {
  const nav = useNavigate()
  const { name, id, loading } = useContext<User>(UserContext)
  const cards = useSignal([ 
    {value: 'A-♦️', disabled: true},
    {value: '2-♥️', disabled: false},
    {value: '7-♠️', disabled: false},
    {value: 'K-♣️', disabled: true}, 
    {value: '3-♦️', disabled: true},
    {value: 'J-♥️', disabled: false},
    {value: 'Q-♣️', disabled: true}
  ])

  const enterQueue = $(async () => {
    try {
      const res = await axios.post('/api/enter-queue', {
        user: {
          id,
          name
        }
      })
      console.log('enter queue success', res.data)
      nav.path = '/queue'
    } catch(err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        console.error('enter queue failed', err.response.data.message)
        if (err.response.status === 401) nav.path = '/queue'
        return err.response.data.message
      }
    }
  })

  // eslint-disable-next-line qwik/single-jsx-root
  if (loading) return <h1>Carregando...</h1>
  // eslint-disable-next-line qwik/single-jsx-root
  if (!id) return <h1>Favor logar acima</h1>

  const handleClickx = $((card: { value: string, disabled: boolean }) => {
    if (card.disabled) return
    cards.value = cards.value.filter(c => c.value !== card.value)
    
  })



  return (
    <div>
      Obrigado por logar {name}

      <div style={{ width: '100%'}}>
      <div class="hand hhand-compact">
        {cards.value.sort((a, b) => {
          if (a.disabled && b.disabled) return 1
          if (a.disabled && !b.disabled) return -1
          return 1
        }).map((card) => <img class='card' style={{filter: `contrast(${card.disabled ? '0.5' : '1'})`}} src={`/cards/${card.value}.svg`} onClick$={() => handleClickx(card)}/>)}
      </div>
      </div>
      
      <button onClick$={enterQueue}>Entrar na fila</button>
      {/* <Link class="mindblow" href="/flower/">
        Blow my mind 🤯 {name}
      </Link> */}
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
