import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/my-life-in-motion/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg', 'icons/*.png'],
      manifest: {
        id: '/my-life-in-motion/',
        name: 'My Life in Motion',
        short_name: 'My Life',
        description: 'A place to notice. A direction to keep. Stored on your device.',
        start_url: '/my-life-in-motion/',
        scope: '/my-life-in-motion/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#14171f',
        theme_color: '#14171f',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: '/my-life-in-motion/index.html',
        navigateFallbackAllowlist: [/^\/my-life-in-motion\/(?:index\.html)?$/],
      },
    }),
  ],
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.APP_BUILD_VERSION ?? 'P00-R1-local'),
    __BUILD_COMMIT__: JSON.stringify(process.env.APP_BUILD_COMMIT ?? 'local'),
  },
  build: { sourcemap: false, target: 'es2022' },
})
