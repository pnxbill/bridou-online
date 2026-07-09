import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { Header } from '@/components/Header'
import './globals.css'

// The card faces (@bridou/cards-ui) are designed around Outfit
const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bridou Online',
  description: 'Bridou online',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={outfit.className}>
        <AuthProvider>
          <Header />
          <main className="main">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
