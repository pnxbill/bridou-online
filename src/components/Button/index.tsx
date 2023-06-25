import { component$, Slot, useStylesScoped$ } from '@builder.io/qwik';
import styles from './styles.css?inline';

interface Props {
  onClick?: () => void;
  className?: string;
}

export default component$(({ onClick, className = '' }: Props) => {
  useStylesScoped$(styles);

  return (
    <button onClick$={onClick} class={`button ${className}`}>
      <span class="button_lg">
        <span class="button_sl"></span>
        <span class="button_text">
          <Slot />
        </span>
      </span>
    </button>
  );
});
