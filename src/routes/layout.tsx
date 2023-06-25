import {
  component$,
  Slot,
  useContext,
} from '@builder.io/qwik';
import { User, UserContext } from '~/context';

export default component$(() => {
  const { loading } = useContext<User>(UserContext);

  return (
    <main>
      {loading ? (
        <h1 class="bridou-title">Bridou.com</h1>
      ) : (
        <section>
          <Slot />
        </section>
      )}
    </main>
  );
});
