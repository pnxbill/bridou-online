import { component$, useContext, useStylesScoped$ } from '@builder.io/qwik';
import { useNavigate } from '@builder.io/qwik-city';
import type { TAuth, User} from '~/context';
import { UserContext } from '~/context';
import { AuthContext } from '~/context';
import { QwikLogo } from '../icons/qwik';
import styles from './header.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  const nav = useNavigate()
  const { id, name, loading } = useContext<User>(UserContext)
  const auth = useContext<TAuth>(AuthContext)

  return (
    <header>
      <div class="logo">
          <button style={{border: 'none', backgrouund: 'transparent'}} onClick$={() => nav.path = '/'}>
            <QwikLogo />
          </button>         
        {id ? <span onClick$={auth.logout}>{name}</span> : loading ? null : <button onClick$={auth.handleAuth}>LOGAR</button>}
      </div>
    </header>
  );
});
