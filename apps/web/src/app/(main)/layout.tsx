import type { ReactNode } from 'react'
import { AppHeader } from '@/components/AppHeader'

/** Standard chrome (fixed header + centered column) for everything except
 *  the full-bleed screens — home and the game table carry their own. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="main">{children}</main>
    </>
  )
}
