import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'dropby',
        short_name: 'dropby',
        description: 'One tap tells your friends you\'re open to a spontaneous visit.',
        theme_color: '#10b981',
        background_color: '#10b981',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/home',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // API calls
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Static files served by Express (avatars, uploads, etc.)
      // Matches any path starting with a slash followed by a segment that
      // contains no dot (i.e. not a Vite-owned asset like /icon-192.png)
      // but does eventually contain a dot in a later segment (i.e. a file).
      '^/[^.]+/.+\\..+': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
