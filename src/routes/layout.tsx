import { $, component$, Slot, useContext } from '@builder.io/qwik';
import SignIn from '~/components/SignIn';
import Splash from '~/components/Splash';
import { AuthContext, User, UserContext } from '~/context';

export default component$(() => {
  const { loading, id } = useContext<User>(UserContext);
  const { logout } = useContext(AuthContext);

  const render = () => {
    if (loading) return <Splash />;

    return (
      <section>
        {id ? (
          <>
            <button onClick$={logout}>logout</button>
            <Slot />{' '}
          </>
        ) : (
          <SignIn />
        )}
      </section>
    );
  };

  return <main>{render()}</main>;
});
