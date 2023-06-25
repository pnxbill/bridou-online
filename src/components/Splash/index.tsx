import { component$, useStylesScoped$ } from '@builder.io/qwik';
import styles from './styles.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  return (
    <div class="splash">
      <h1 class="splash__title">Bridou.com</h1>
    </div>
  );
});
