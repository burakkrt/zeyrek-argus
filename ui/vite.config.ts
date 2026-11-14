import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { parse } from 'dotenv'
import { defineConfig } from 'vite'

const envFile = fileURLToPath(new URL('../.env', import.meta.url))
const env = existsSync(envFile) ? parse(readFileSync(envFile)) : {}
const port = Number(env.ARGUS_PORT || process.env.ARGUS_PORT || 5300)

/** Geliştirmede arayüz ARGUS_PORT'ta, sunucu bir üst portta; `/api` oraya aktarılır (SSE dahil). */
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  // shadcn-svelte bileşenleri birbirini `$lib/...` ile içe aktarır.
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  server: {
    port,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${port + 1}`, changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
