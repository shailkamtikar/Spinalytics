import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the browser calls /api on this origin; Vite forwards it to FastAPI.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  preview: {
    // the built app talks to the same /api path; the proxy stands in for the production host
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: './src/test-setup.ts',
  },
})
