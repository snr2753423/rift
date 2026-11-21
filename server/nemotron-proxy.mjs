// Server-side proxy: the NVIDIA key never reaches the browser.
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MAX_BODY = 2_000_000 // room for a base64 floor-plan crop
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const hostname = h => { try { return new URL(`http://${h}`).hostname } catch { return '' } }
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 40
let windowStart = Date.now()
let count = 0

function allowedModels(env) {
  return new Set([env.NVIDIA_MODEL, env.NVIDIA_FALLBACK_MODEL].filter(Boolean))
}

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
      return send(res, 200, { success: true, data: { configured: Boolean(env.NVIDIA_API_KEY), model: env.NVIDIA_MODEL ?? null, fallbackModel: env.NVIDIA_FALLBACK_MODEL ?? null }, error: null })
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
    const models = allowedModels(env)
    const model = models.has(body?.model) ? body.model : env.NVIDIA_MODEL
    if (!Array.isArray(body?.messages) || body.messages.length === 0 || body.messages.length > 80) {
      return send(res, 400, { success: false, data: null, error: 'messages must be a non-empty array (max 80)' })
    }
    const upstream = {
      model,
      messages: body.messages,
      tools: Array.isArray(body.tools) && body.tools.length <= 16 ? body.tools : undefined,
      tool_choice: body.tools ? 'auto' : undefined,
      temperature: typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.3,
      top_p: 0.95,
      seed: Number.isInteger(body.seed) ? body.seed : undefined,
      max_tokens: Math.min(Math.max(Number(body.max_tokens) || 4096, 256), 8192),
      chat_template_kwargs: body.thinking === false
        ? { enable_thinking: false }
        : { enable_thinking: true, reasoning_budget: Math.min(4096, Math.max(128, Number(body.reasoning_budget) || 1200)) },
      stream: body.stream === true,
    }
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
