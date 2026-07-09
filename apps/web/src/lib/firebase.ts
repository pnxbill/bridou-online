import { getApps, initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'

// Firebase web config is public by design; env vars allow overriding per environment.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAx_aEjr3dRD8T2DmfULuNBK3zYOTMGekE',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'bridou-online.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bridou-online',
  storageBucket: 'bridou-online.appspot.com',
  messagingSenderId: '648671635109',
  appId: '1:648671635109:web:dbfa0799df25f303e38f4c',
}

const app = getApps()[0] ?? initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
