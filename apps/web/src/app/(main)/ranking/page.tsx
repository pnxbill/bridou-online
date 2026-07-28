import type { Metadata } from 'next'
import { RankingClient } from '@/features/ranking/RankingClient'

export const metadata: Metadata = { title: 'Ranking — Bridou' }

export default function RankingPage() {
  return <RankingClient />
}
