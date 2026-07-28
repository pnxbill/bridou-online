import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { DiariaClient } from '@/features/daily/DiariaClient'

export const metadata: Metadata = { title: 'Mão do Dia — Bridou' }

/** Full-bleed like the game table it is — the header is the floating menu
 *  button the HUD already leaves room for, never a bar over the felt. */
export default function DiariaPage() {
  return (
    <>
      <AppHeader variant="floating" />
      <DiariaClient />
    </>
  )
}
