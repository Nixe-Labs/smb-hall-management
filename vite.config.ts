import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

// The site is built at root (`/`) in dev and under `/smb-hall-management/` on
// GitHub Pages (the CI sets BASE_URL). The PWA manifest's `scope` / `start_url`
// and Workbox's `navigateFallback` MUST line up with this base, or iOS will
// launch the home-screen icon at the wrong origin path and 404.
const base = process.env.BASE_URL || '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
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
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
