import { $, component$, Slot, useContext } from '@builder.io/qwik';
import Loader from '~/components/Loader';
import SignIn from '~/components/SignIn';
import Splash from '~/components/Splash';
import { User, UserContext } from '~/context';

export default component$(() => {
  const { loading, id } = useContext<User>(UserContext);

  const render = () => {
    if (loading) return <Splash />;

    return <section>{id ? <Slot /> : <SignIn />}</section>;
  };

  return <main>{render()}</main>;
});
