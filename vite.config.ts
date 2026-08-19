import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'

// SINGLE_FILE=1 produces one self-contained dist/index.html, which
// scripts/build-artifact.mjs then unwraps into a publishable fragment.
const singleFile = process.env.SINGLE_FILE === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Inline the sample import files so the hosted build can still demo drag-and-drop.
    assetsInlineLimit: singleFile ? 100_000_000 : 4096,
  },
})
