import { $, component$, Slot, useContext } from '@builder.io/qwik';
import Content from '~/components/Content';
import Footer from '~/components/Footer';
import SideBar from '~/components/SideBar';
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
            <SideBar />
            <Content>
              <Slot />
            </Content>
            <Footer />
          </>
        ) : (
          <SignIn />
        )}
      </section>
    );
  };

  return <main>{render()}</main>;
});
