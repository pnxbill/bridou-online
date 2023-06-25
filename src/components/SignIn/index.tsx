import { component$, useContext, useStylesScoped$ } from '@builder.io/qwik';
import styles from './styles.css?inline';
import Button from '../Button';
import { TAuth } from '~/context';
import { AuthContext } from '~/context';

export default component$(() => {
  useStylesScoped$(styles);

  const { handleAuth } = useContext<TAuth>(AuthContext);
  return (
    <div class="sign-in">
      <Button onClick={handleAuth}>Logar com Google</Button>
    </div>
  );
});
