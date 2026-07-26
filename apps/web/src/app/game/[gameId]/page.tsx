import { AppHeader } from '@/components/AppHeader'
import { GamePageClient } from '@/features/game/GamePageClient'

interface Props {
  params: Promise<{ gameId: string }>
}

/** Full-bleed table — the header is the floating menu button the HUD already
 *  leaves room for, never a bar over the felt. */
export default async function GamePage({ params }: Props) {
  const { gameId } = await params
  return (
    <>
      <AppHeader variant="floating" />
      <GamePageClient gameId={gameId} />
    </>
  )
}
