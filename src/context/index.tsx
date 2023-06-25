import {
  component$,
  useStore,
  useContextProvider,
  $,
  Slot,
  useTask$,
  createContextId,
  useVisibleTask$,
} from '@builder.io/qwik';

import { isServer } from '@builder.io/qwik/build';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { setCookie } from '~/utils/cookie';
import getServerIP from './getServerIP';
import axios from 'axios';

const firebaseConfig = {
  apiKey: 'AIzaSyAx_aEjr3dRD8T2DmfULuNBK3zYOTMGekE',
  authDomain: 'bridou-online.firebaseapp.com',
  projectId: 'bridou-online',
  storageBucket: 'bridou-online.appspot.com',
  messagingSenderId: '648671635109',
  appId: '1:648671635109:web:dbfa0799df25f303e38f4c',
  measurementId: 'G-ERFTN1E0JG',
};

const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

export interface User {
  name?: string | null;
  email?: string | null;
  id?: string;
  photoURL?: string | null;
  loading?: boolean;
  isGM?: boolean;
}

export interface TAuth {
  handleAuth?: () => void;
  logout?: () => void;
}

export interface TIP {
  IP?: string;
}

export const gameMasters = ['nIrszj4f3Actvh5YmQSev5CQvHz2'];

// Create a new context descriptor
export const UserContext = createContextId('user-context');
export const AuthContext = createContextId('auth-context');
export const ConfigContext = createContextId('config-context');

export interface TConfig {
  IP?: string;
}

export const Context = component$(() => {
  const config = useStore<TConfig>({ IP: '' });
  useTask$(() => {
    if (isServer) {
      const SERVER_IP = import.meta.env.PROD
        ? ''
        : `http://${getServerIP}:3001`;
      config.IP = SERVER_IP;
    }
  });
  if (config.IP) axios.defaults.baseURL = config.IP;

  const handleAuth = $(async () => {
    signInWithPopup(auth, provider);
  });

  const logout = $(() => {
    signOut(auth);
  });

  const user = useStore<User>({ loading: true });
  useVisibleTask$(() => {
    axios.defaults.baseURL = config.IP;
    auth.onAuthStateChanged((firebaseUser) => {
      user.loading = false;
      if (!firebaseUser) return;
      user.email = firebaseUser.email;
      user.id = firebaseUser.uid;
      user.photoURL = firebaseUser.photoURL;
      user.name = firebaseUser.displayName;
      user.isGM = gameMasters.includes(firebaseUser.uid);
      setCookie('uid', firebaseUser.uid, 1);
    });
  });

  // Assign value (state) to the context (UserContext)
  useContextProvider(UserContext, user);
  useContextProvider(ConfigContext, config);
  useContextProvider(AuthContext, { handleAuth, logout } as TAuth);

  return (
    <div id="context-wrapper">
      <Slot />
    </div>
  );
});
