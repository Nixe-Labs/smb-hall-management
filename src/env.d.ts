/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** True when built via `npm run build:native` (Capacitor) — toggles
   *  hash history routing + suppresses the PWA service worker. */
  readonly VITE_CAPACITOR: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
