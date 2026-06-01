import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for the SMB Hall native apps.
 *
 * Bundle ID (`appId`) is permanent once submitted to the App Store —
 * Apple does not allow changes after first review approval. If you need
 * a different bundle ID, change it here BEFORE running
 * `npx cap add ios` for the first time.
 *
 * `webDir` points at Vite's output. The native shells copy this folder
 * into themselves on every `npx cap sync`.
 */
const config: CapacitorConfig = {
  appId: 'com.nixelabs.smbhall',
  appName: 'SMB Hall',
  webDir: 'dist',

  // We do NOT need a server.url — the native shells serve the built web
  // assets bundled inside the app. Setting server.url would point the
  // app at a live URL instead, useful for hot-reload during dev but
  // wrong for production builds.

  plugins: {
    SplashScreen: {
      // Brand-matched splash. The colors come from the editorial
      // palette in style.css (--ink + --paper). Auto-hides once the
      // Vue app mounts.
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#f4efe6',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Dark text on the cream background to match the editorial theme.
      style: 'LIGHT',
      backgroundColor: '#f4efe6',
      overlaysWebView: false,
    },
  },

  ios: {
    // Allow the app to talk to Supabase + any custom domains over
    // HTTPS. Capacitor defaults are usually fine; surface the option
    // here in case we need to relax for a dev URL later.
    contentInset: 'always',
  },

  android: {
    // Allow plaintext traffic for local development (dev server on
    // your LAN). Production builds always use HTTPS via Supabase.
    allowMixedContent: false,
  },
}

export default config
