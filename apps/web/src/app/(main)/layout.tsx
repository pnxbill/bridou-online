import type { ReactNode } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { AppNav } from '@/components/AppNav'

/** Standard chrome (wordmark header, centered column, bottom nav) for every
 *  screen but the play surfaces — the table and the Mão do Dia keep the
 *  floating menu button instead, and the entrance composes its own. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="main">{children}</main>
      <AppNav />
    </>
  )
}
