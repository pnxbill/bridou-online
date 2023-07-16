import {
  $,
  component$,
  Slot,
  useContext,
  useStylesScoped$,
} from '@builder.io/qwik';
import Content from '~/components/Content';
import Footer from '~/components/Footer';
import SideBar from '~/components/SideBar';
import SignIn from '~/components/SignIn';
import Splash from '~/components/Splash';
import { AuthContext, User, UserContext } from '~/context';
import styles from './styles.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  const { loading, id } = useContext<User>(UserContext);
  const { logout } = useContext(AuthContext);

  const render = () => {
    if (loading) return <Splash />;

    return (
      <section>
        {id ? (
          <div class="app-container">
            <SideBar />
            <Content>
              <Slot />
            </Content>
            <Footer />
          </div>
        ) : (
          <SignIn />
        )}
      </section>
    );
  };

  return <main>{render()}</main>;
});
