import { component$, useContext, $ } from '@builder.io/qwik';
import type { DocumentHead} from '@builder.io/qwik-city';
import { useNavigate } from '@builder.io/qwik-city';
import axios from 'axios';
import type { User } from '~/context';
import { UserContext } from '~/context';

export default component$(() => {
  const nav = useNavigate()
  const { name, id, loading } = useContext<User>(UserContext)

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


  return (
    <div>
      {name} conectado.
      <button onClick$={enterQueue}>Entrar na fila</button>
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
