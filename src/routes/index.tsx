import { component$, useContext, $, useStylesScoped$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { useNavigate } from '@builder.io/qwik-city';
import axios from 'axios';
import { UserContext } from '~/context';
import type { User } from '~/context';
import styles from './styles.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  const nav = useNavigate();
  const { name, id, loading, photoURL } = useContext<User>(UserContext);

  const enterQueue = $(async () => {
    try {
      await axios.post('/api/enter-queue', {
        user: {
          id,
          name,
          photoURL,
        },
      });
      nav('/queue');
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        console.error('enter queue failed', err.response.data.message);
        if (err.response.status === 401) nav('/queue');
        return err.response.data.message;
      }
    }
  });

  if (loading) return <h1>Carregando...</h1>;
  if (!id) return <h1>Favor logar acima</h1>;

  return (
    <div class="container">
      <button class="btn btn-enter-queue" onClick$={enterQueue}>
        Entrar na fila
      </button>
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
