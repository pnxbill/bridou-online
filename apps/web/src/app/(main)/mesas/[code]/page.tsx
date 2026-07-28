import type { Metadata } from 'next'
import { MesaDetailClient } from '@/features/mesas/MesaDetailClient'

export const metadata: Metadata = { title: 'Mesa — Bridou' }

export default async function MesaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <MesaDetailClient code={code} />
}
