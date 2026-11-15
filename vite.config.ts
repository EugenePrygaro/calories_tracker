import { realpathSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const THEME = '#0c1210'

// Локальний API з scripts/local-server.js (запускається через npm run dev).
const apiProxy = { '/api': `http://127.0.0.1:${process.env.API_PORT || 5174}` }

// Канонічний шлях: на Windows той самий проєкт може відкритися як `c:\…` і `C:\…`,
// і тоді бандлер вважає node_modules двома різними папками → дві копії React.
const dir = (rel: string) => realpathSync.native(fileURLToPath(new URL(rel, import.meta.url)))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': нова версія застосовується, коли вкладку сховали (див. main.tsx), а не посеред введення
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Calories Tracker',
        short_name: 'Calories',
        description: 'Персональний трекер калорій',
        lang: 'uk',
        theme_color: THEME,
        background_color: THEME,
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Кешуємо лише оболонку застосунку (миттєвий старт і робота без мережі).
        // Дані живуть у Redis на сервері, тож /api сервіс-воркер не чіпає взагалі.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': dir('./src'),
      '@shared': dir('./shared'),
    },
    dedupe: ['react', 'react-dom', 'zustand'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
})
