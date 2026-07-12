import { getApps, initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'

// Firebase web config is public by design; env vars allow overriding per environment.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAx_aEjr3dRD8T2DmfULuNBK3zYOTMGekE',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'bridou-online.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bridou-online',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'bridou-online.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '648671635109',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:648671635109:web:dbfa0799df25f303e38f4c',
}

const app = getApps()[0] ?? initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

/**
 * Fresh Firebase ID token for the signed-in user (the SDK caches and renews
 * it), or null when logged out. Waits for the initial auth restore so a
 * fetch fired on page load doesn't race the session. This is what every
 * server call sends as `Authorization: Bearer …`.
 */
export const getIdToken = async (): Promise<string | null> => {
  await auth.authStateReady()
  return auth.currentUser ? auth.currentUser.getIdToken() : null
}
