import type { Metadata } from 'next'
import { ResenhaClient } from '@/features/recap/ResenhaClient'

export const metadata: Metadata = { title: 'Resenha da Mesa — Bridou' }

export default async function ResenhaPage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params
  return <ResenhaClient gameId={gameId} />
}
