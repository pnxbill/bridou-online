import { component$, Slot, useStylesScoped$ } from '@builder.io/qwik';
import styles from './styles.css?inline';

interface Props {
  onClick: () => void;
}

export default component$((props: Props) => {
  useStylesScoped$(styles);
  return (
    <button onClick$={props.onClick} class="button">
      <span class="button_lg">
        <span class="button_sl"></span>
        <span class="button_text">
          <Slot />
        </span>
      </span>
    </button>
  );
});
