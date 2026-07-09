'use client'

import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, googleProvider } from '@/lib/firebase'

export interface AuthUser {
  id: string
  name: string
  photoURL?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signIn: () => void
  logOut: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: () => {},
  logOut: () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (firebaseUser) => {
        setLoading(false)
        if (!firebaseUser) {
          setUser(null)
          document.cookie = 'uid=; path=/; max-age=0'
          return
        }
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.displayName ?? 'Jogador',
          ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
        })
        // The game page's server component reads this to fetch the snapshot.
        // Goes away when the server starts verifying Firebase ID tokens (see PLAN.md).
        document.cookie = `uid=${firebaseUser.uid}; path=/; max-age=86400`
      }),
    [],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn: () => signInWithPopup(auth, googleProvider),
        logOut: () => signOut(auth),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
