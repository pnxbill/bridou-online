import type { Metadata } from 'next'
import { MesasClient } from '@/features/mesas/MesasClient'

export const metadata: Metadata = { title: 'Suas mesas — Bridou' }

export default function MesasPage() {
  return <MesasClient />
}
