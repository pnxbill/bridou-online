import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GameClient } from '@/features/game/GameClient'
import type { GameEntry } from '@/lib/api'
import { SERVER_URL } from '@/lib/config'

interface Props {
  params: Promise<{ gameId: string }>
}

export default async function GamePage({ params }: Props) {
  const { gameId } = await params
  const playerId = (await cookies()).get('uid')?.value
  if (!playerId) redirect('/')

  const res = await fetch(`${SERVER_URL}/api/enter-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, playerId }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const { message } = await res.json().catch(() => ({ message: 'Erro inesperado' }))
    return <p className="hint">{message}</p>
  }

  const { game } = (await res.json()) as { game: GameEntry }
  return <GameClient gameId={gameId} playerId={playerId} initialSnapshot={game} />
}
