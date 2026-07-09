import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { Header } from '@/components/Header'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bridou Online',
  description: 'Bridou online',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <Header />
          <main className="main">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
