// Server-side proxy: the NVIDIA key never reaches the browser.
import { MAX_BODY, NVIDIA_URL, buildUpstream, modelsFor } from './upstream.mjs'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const hostname = h => { try { return new URL(`http://${h}`).hostname } catch { return '' } }
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 40
let windowStart = Date.now()
let count = 0

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export function createNemotronHandler(env) {
  return async function handle(req, res) {
    if (req.method === 'GET') {
      return send(res, 200, { success: true, data: { configured: Boolean(env.NVIDIA_API_KEY), model: modelsFor(env).model, fallbackModel: modelsFor(env).fallback }, error: null })
    }
    if (req.method !== 'POST') return send(res, 405, { success: false, data: null, error: 'method not allowed' })
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { success: false, data: null, error: 'content-type must be application/json' })
    // localhost-only: defeats DNS rebinding and cross-site use of the key
    const origin = req.headers.origin
    let originHost = ''
    try { originHost = origin ? new URL(origin).hostname : '' } catch { originHost = 'invalid' }
    const originOk = !origin || LOCAL_HOSTS.has(originHost) || LOCAL_HOSTS.has(`[${originHost}]`)
    if (!LOCAL_HOSTS.has(hostname(req.headers.host ?? '')) || !originOk) return send(res, 403, { success: false, data: null, error: 'only local requests are allowed' })
    if (!env.NVIDIA_API_KEY) return send(res, 503, { success: false, data: null, error: 'NVIDIA_API_KEY not configured' })
    const now = Date.now()
    if (now - windowStart > WINDOW_MS) { windowStart = now; count = 0 }
    if (++count > MAX_PER_WINDOW) return send(res, 429, { success: false, data: null, error: 'rate limited' })
    let body
    try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { success: false, data: null, error: 'invalid JSON body' }) }
    const built = buildUpstream(body, env)
    if (built.error) return send(res, 400, { success: false, data: null, error: built.error })
    const { upstream } = built
    const model = upstream.model
    const started = Date.now()
    const ac = new AbortController()
    const onClose = () => { if (!res.writableEnded) ac.abort() }
    res.on('close', onClose)
    let timer = setTimeout(() => ac.abort(), 60_000) // time to first byte
    try {
      const r = await fetch(NVIDIA_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(upstream),
        signal: ac.signal,
      })
      if (upstream.stream && r.ok && r.body) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        for await (const chunk of r.body) {
          clearTimeout(timer)
          timer = setTimeout(() => ac.abort(), 30_000) // idle timeout between chunks
          res.write(chunk)
        }
        return res.end()
      }
      const text = await r.text()
      if (!r.ok) {
        console.error('[nemotron] upstream', r.status, text.slice(0, 300))
        return send(res, 502, { success: false, data: null, error: `NVIDIA API returned ${r.status}` })
      }
      const json = JSON.parse(text)
      return send(res, 200, { success: true, data: { ...json, latencyMs: Date.now() - started, model }, error: null })
    } catch (e) {
      console.error('[nemotron] request failed', e instanceof Error ? e.message : e)
      if (res.headersSent) return res.destroy()
      return send(res, 504, { success: false, data: null, error: 'NVIDIA API unreachable or timed out' })
    } finally {
      clearTimeout(timer)
      res.off('close', onClose)
    }
  }
}
