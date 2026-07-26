import type { Metadata } from 'next'
import { ConquistasClient } from '@/features/achievements/ConquistasClient'

export const metadata: Metadata = { title: 'Conquistas — Bridou' }

export default function ConquistasPage() {
  return <ConquistasClient />
}
