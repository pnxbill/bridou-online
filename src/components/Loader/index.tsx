import { component$, useStylesScoped$ } from '@builder.io/qwik';
import styles from './styles.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  return (
    <div class="loader-container">
      <div class="loader"></div>
    </div>
  );
});
