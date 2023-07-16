import { component$ } from '@builder.io/qwik';

export interface TPlayer {
  name: string
  id: string
  socket?: string
}

interface Props {
  players: TPlayer[]
}

export default component$(({ players }: Props) => {
  if (!players.length) return null
  

  return (
    <ul>
      {players.map(player => (<li>{player.name}</li>))}
    </ul>
  );
});

