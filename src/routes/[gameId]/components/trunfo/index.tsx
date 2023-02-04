import type { QRL } from '@builder.io/qwik';
import { component$ } from '@builder.io/qwik';

export interface TCard {
  value: string
  disabled: boolean
}

interface Props {
  value: string
}

export default component$(({ value }: Props) => {
  

  return (
    <div class="trunfo-container">
       <img class='card' src={`/cards/${value}.svg`} />
    </div>
  );
});

