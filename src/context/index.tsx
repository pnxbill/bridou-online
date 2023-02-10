import {
  component$,
  useStore,
  useContextProvider,
  createContext,
  useClientEffect$,
  $,
  Slot,
} from '@builder.io/qwik';

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { initializeApp } from "firebase/app";
import { setCookie } from '~/utils/cookie';
import axios from 'axios';

const firebaseConfig = {
  apiKey: "AIzaSyAx_aEjr3dRD8T2DmfULuNBK3zYOTMGekE",
  authDomain: "bridou-online.firebaseapp.com",
  projectId: "bridou-online",
  storageBucket: "bridou-online.appspot.com",
  messagingSenderId: "648671635109",
  appId: "1:648671635109:web:dbfa0799df25f303e38f4c",
  measurementId: "G-ERFTN1E0JG"
};

const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
export const auth = getAuth(app)
export const provider = new GoogleAuthProvider();

export interface User {
  name?: string | null
  email?: string | null
  id?: string
  photoURL?: string | null
  loading?: boolean
  isGM?: boolean
}

export interface TAuth {
  handleAuth?: () => void
  logout?: () => void
}

// Create a new context descriptor
export const UserContext = createContext('user-context');
export const AuthContext = createContext('auth-context');

export const BASE_URL = import.meta.env.VITE_APP_SERVER_IP
axios.defaults.baseURL = BASE_URL

export const Context = component$(() => {
  const handleAuth = $(async () => {
    signInWithPopup(auth,provider)
  })

  const logout = $(() => {
    signOut(auth)
  })

  const user = useStore<User>({ loading: true })

  useClientEffect$(() => {
    auth.onAuthStateChanged((firebaseUser) => {
      user.loading = false
      user.email = firebaseUser?.email
      user.id = firebaseUser?.uid
      user.photoURL = firebaseUser?.photoURL
      user.name = firebaseUser?.displayName
      user.isGM = firebaseUser?.uid === 'nIrszj4f3Actvh5YmQSev5CQvHz2'
      if (firebaseUser) setCookie('uid', firebaseUser.uid, 1)
    })
  })


  // Assign value (state) to the context (UserContext)
  useContextProvider(UserContext, user);
  useContextProvider(AuthContext, { handleAuth, logout } as TAuth)

  
  return (
    <div id="context-wrapper">
      <Slot/>
    </div>
  );
});