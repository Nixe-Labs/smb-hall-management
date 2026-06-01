import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

// The site is built at root (`/`) in dev and under `/smb-hall-management/` on
// GitHub Pages (the CI sets BASE_URL). The PWA manifest's `scope` / `start_url`
// and Workbox's `navigateFallback` MUST line up with this base, or iOS will
// launch the home-screen icon at the wrong origin path and 404.
//
// For native (Capacitor) builds we force `base = '/'` and skip the PWA plugin
// entirely. Reasons:
//   1. Capacitor serves the bundle from capacitor://localhost (iOS) or
//      https://localhost (Android) — a sub-path base would 404 every asset.
//   2. The Workbox service worker fights the native shell's own navigation
//      handling, producing "blank screen on app open" symptoms.
// Triggered by:  VITE_CAPACITOR=true npm run build  (see package.json scripts)
const isCapacitorBuild = process.env.VITE_CAPACITOR === 'true'
const base = isCapacitorBuild ? '/' : (process.env.BASE_URL || '/')

export default defineConfig({
  base,
  define: {
    // Expose the flag to the Vue app so the router can pick hash history
    // for native builds (capacitor:// URLs don't play well with HTML5
    // history mode).
    'import.meta.env.VITE_CAPACITOR': JSON.stringify(isCapacitorBuild),
  },
  plugins: [
    vue(),
    tailwindcss(),
    // PWA plugin is intentionally skipped for native builds — see comment above.
    ...(isCapacitorBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SMB Hall Management',
        short_name: 'SMB Hall',
        description: 'Bookings, billing, advances, enquiries and reports for SMB Marriage Hall.',
        theme_color: '#1a1a1a',
        background_color: '#f4efe6',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // SPA navigations (incl. iOS PWA launch) fall back to the app shell
        navigateFallback: `${base}index.html`,
        // The PDF library is a large, lazy-loaded chunk — fetch it on demand
        // instead of bloating the install precache.
        globIgnores: ['**/pdfGenerator-*'],
        // Take control of every open tab as soon as a new SW activates,
        // instead of waiting for every tab to close. Without these, a deploy
        // leaves long-lived tabs running the previous chunk graph — a known
        // cause of "clicks sometimes do nothing, reload fixes it".
        skipWaiting: true,
        clientsClaim: true,
      },
    })]),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
