/**
 * npm run dev       → локальний API (порт 5174) + Vite dev server з проксі /api
 * npm run preview   → те саме, але Vite віддає продакшн-збірку з dist/
 */
import { spawn } from 'node:child_process'
import { createServer, preview } from 'vite'

const isPreview = process.argv.includes('--preview')

const api = spawn(process.execPath, ['scripts/local-server.js'], { stdio: 'inherit' })
const stopApi = () => {
  if (!api.killed) api.kill()
}

/** @type {{ close(): Promise<void> } | undefined} */
let server

/** @param {number} [code] */
async function shutdown(code = 0) {
  await server?.close()
  stopApi()
  process.exit(code)
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
api.once('exit', (code) => {
  if (code) void shutdown(code)
})

try {
  if (isPreview) {
    const s = await preview()
    server = { close: () => s.close() }
    s.printUrls()
  } else {
    const s = await createServer()
    await s.listen()
    server = s
    s.printUrls()
  }
} catch (error) {
  stopApi()
  throw error
}
