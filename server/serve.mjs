// Production server: static dist/ + /api/chat proxy. Usage: node server/serve.mjs
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { createNemotronHandler } from './nemotron-proxy.mjs'

const root = new URL('../dist/', import.meta.url).pathname
const envFile = new URL('../.env.local', import.meta.url).pathname
const env = { ...process.env }
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !env[m[1]]) env[m[1]] = m[2].trim()
}
const api = createNemotronHandler(env)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }
createServer(async (req, res) => {
  if (req.url?.startsWith('/api/chat')) return api(req, res)
  const path = normalize(join(root, decodeURIComponent((req.url ?? '/').split('?')[0])))
  const file = path.startsWith(root) && existsSync(path) && extname(path) ? path : join(root, 'index.html')
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
  res.end(await readFile(file))
}).listen(Number(env.PORT) || 4173, () => console.log(`RIFT on http://localhost:${Number(env.PORT) || 4173}`))
