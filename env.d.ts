/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_SERVER_IP: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}