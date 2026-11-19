import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApi, staticRoot } from './api/routes.ts'
import { loadConfig } from './config.ts'
import { createContext } from './context.ts'
import { acquireInstanceLock } from './instance-lock.ts'

/**
 * Argus sunucusu. `--dev`: arayüz Vite'tan gelir (ARGUS_PORT), sunucu bir üst portta yalnız `/api` sunar.
 * Normal: arayüzün derlenmiş hâli ve `/api` aynı porttan (ARGUS_PORT).
 */
const dev = process.argv.includes('--dev')
const config = loadConfig()
// Kilit bağlamdan önce alınır: bağlam açılışta yarım kalan koşuları kapatır, başka sunucunun koşusuna dokunmasın.
let releaseLock: () => void
try {
  releaseLock = acquireInstanceLock(config.dataDir)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
const ctx = createContext(config)
const app = new Hono()
app.route('/api', createApi(ctx))

const dist = staticRoot(config.rootDir)
if (!dev && dist) {
  const root = relative(process.cwd(), dist) || '.'
  app.use('/*', serveStatic({ root }))
  app.get('*', (c) => c.html(readFileSync(join(dist, 'index.html'), 'utf8')))
}

const port = dev ? config.port + 1 : config.port
serve({ fetch: app.fetch, port }, () => {
  console.log(
    dev
      ? `Argus sunucusu http://localhost:${port}/api — arayüz: http://localhost:${config.port}`
      : `Argus: http://localhost:${port}${dist ? '' : '  (arayüz derlenmemiş: pnpm build)'}`,
  )
})

const shutdown = async () => {
  ctx.speech.stop()
  await ctx.platform.close()
  ctx.db.close()
  releaseLock()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
