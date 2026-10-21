import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TRANSIT — Emergency Response',
        short_name: 'TRANSIT',
        description:
          'Real-time fleet tracking, anomaly detection and emergency dispatch for transport organizations.',
        theme_color: '#131313',
        background_color: '#131313',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: true },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Never try to serve the API/WS through the app shell.
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
      },
    }),
  ],
  server: {
    host: true, // listen on 0.0.0.0 so a phone on the LAN can connect
  },
  preview: {
    host: true,
  },
})
