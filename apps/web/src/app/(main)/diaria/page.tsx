import type { Metadata } from 'next'
import { DiariaClient } from '@/features/daily/DiariaClient'

export const metadata: Metadata = { title: 'Mão do Dia — Bridou' }

export default function DiariaPage() {
  return <DiariaClient />
}
