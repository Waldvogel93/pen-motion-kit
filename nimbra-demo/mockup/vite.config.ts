import { existsSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vite'

const root = import.meta.dirname
const parent = path.resolve(root, '..')
const productDecisions = path.resolve(parent, 'motion.json')
const decisions = existsSync(productDecisions)
  ? productDecisions
  : path.resolve(root, 'fixtures/motion.json')

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@decisions': decisions,
    },
  },
  server: { fs: { allow: [root, parent] } },
  build: { assetsInlineLimit: 100_000_000 },
})
