import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['metasepia'],
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Redirect any import of 'react-force-graph' (transitive or direct)
      // to our lightweight 2D-only shim so three.js / aframe are never loaded.
      'react-force-graph': resolve(__dirname, 'src/lib/ForceGraph2D.tsx'),
    },
  },
  optimizeDeps: {
    exclude: ['react-force-graph'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdf';
          if (id.includes('framer-motion')) return 'motion';
        },
      },
    },
  },
})
