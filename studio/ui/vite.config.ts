import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = `http://127.0.0.1:${process.env.STUDIO_PORT || 5174}`

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  // Served from localhost only, so one bundle beats a waterfall of split chunks.
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5175,
    strictPort: true,
    // The API refuses foreign Host and Origin headers, so the dev proxy presents the API's own.
    proxy: { '/api': { target: api, changeOrigin: true, headers: { origin: api } } }
  }
})
