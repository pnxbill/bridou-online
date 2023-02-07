import { useStylesScoped$ } from '@builder.io/qwik';
import { component$ } from '@builder.io/qwik';
import styles from './styles.css?inline'


export interface TCard {
  value: string
  disabled: boolean
}

interface Props {
  value: string
}

export default component$(({ value }: Props) => {
  useStylesScoped$(styles);


  return (
    <div class="trunfo-container">
       <img class='card trunfo' src={`/cards/${value}.svg`} />
    </div>
  );
});

