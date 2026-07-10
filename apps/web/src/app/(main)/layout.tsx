import type { ReactNode } from 'react'
import { Header } from '@/components/Header'

/** Standard chrome (header + centered column) for everything except the game. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="main">{children}</main>
    </>
  )
}
