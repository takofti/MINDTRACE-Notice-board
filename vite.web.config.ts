import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Browser-only development harness. The production app runs inside Electron;
// this config lets designers and automated checks open the renderer in a tab.
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  server: {
    port: 5183,
    strictPort: true
  }
})
