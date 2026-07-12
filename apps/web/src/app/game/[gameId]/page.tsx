import { GamePageClient } from '@/features/game/GamePageClient'

interface Props {
  params: Promise<{ gameId: string }>
}

export default async function GamePage({ params }: Props) {
  const { gameId } = await params
  return <GamePageClient gameId={gameId} />
}
