import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Control Bomba',
    short_name: 'CtrlBomba',
    description: 'App para controlar temporizador de bomba de agua',
    start_url: '/',
    display: 'standalone',
    background_color: '#2c2c2e',
    theme_color: '#2c2c2e',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}