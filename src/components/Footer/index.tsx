import {
  Slot,
  component$,
  useContext,
  useStylesScoped$,
} from '@builder.io/qwik';
import styles from './styles.css?inline';
import { AuthContext, UserContext } from '~/context';

export default component$(() => {
  useStylesScoped$(styles);
  const { photoURL, name } = useContext(UserContext);

  const [firstName] = name?.split(' ') || [];

  return (
    <div class="footer">
      <img
        class="profile-pic"
        width={50}
        height={50}
        src={photoURL as string}
      />
      <span class="user-name">{firstName}</span>
    </div>
  );
});
