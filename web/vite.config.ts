import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/league':    { target: 'http://localhost:3000', changeOrigin: true },
      '/leagues':   { target: 'http://localhost:3000', changeOrigin: true },
      '/auth':      { target: 'http://localhost:3000', changeOrigin: true },
      '/my-leagues':{ target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
