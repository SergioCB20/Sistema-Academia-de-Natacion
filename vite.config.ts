import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Academia Los Parrales',
        short_name: 'Los Parrales',
        description: 'Gestión de Academia de Natación',
        theme_color: '#0ea5e9', // Azul principal
        background_color: '#ffffff',
        display: 'standalone', // QUITA la barra del navegador
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png', // Tendrás que crear estos iconos luego
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })],
})
