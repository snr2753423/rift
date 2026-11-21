// Netlify Edge Function at /api/chat: the deployed site's proxy to NVIDIA, so the key stays server-side.
// Edge Functions limit CPU time, not wall-clock time, so long streamed Nemotron turns are not cut off.
// Set NVIDIA_API_KEY in Netlify (Site configuration → Environment variables).
import { MAX_BODY, NVIDIA_URL, buildUpstream, modelsFor } from '../../server/upstream.mjs'

const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
const env = () => ({ NVIDIA_API_KEY: Netlify.env.get('NVIDIA_API_KEY'), NVIDIA_MODEL: Netlify.env.get('NVIDIA_MODEL'), NVIDIA_FALLBACK_MODEL: Netlify.env.get('NVIDIA_FALLBACK_MODEL') })

// best-effort per-isolate rate limit; the site's own UI stays far below it
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 60
let windowStart = Date.now(), count = 0

export default async function handler(request) {
  const e = env()
  if (request.method === 'GET') {
    const m = modelsFor(e)
    return json(200, { success: true, data: { configured: Boolean(e.NVIDIA_API_KEY), model: m.model, fallbackModel: m.fallback }, error: null })
  }
  if (request.method !== 'POST') return json(405, { success: false, data: null, error: 'method not allowed' })
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { success: false, data: null, error: 'content-type must be application/json' })
  // same-origin only, so other sites cannot spend the key
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { success: false, data: null, error: 'cross-origin requests are not allowed' })
  if (!e.NVIDIA_API_KEY) return json(503, { success: false, data: null, error: 'NVIDIA_API_KEY not configured' })
  const now = Date.now()
  if (now - windowStart > WINDOW_MS) { windowStart = now; count = 0 }
  if (++count > MAX_PER_WINDOW) return json(429, { success: false, data: null, error: 'rate limited' })

  const text = await request.text()
  if (text.length > MAX_BODY) return json(413, { success: false, data: null, error: 'body too large' })
  let body
  try { body = JSON.parse(text) } catch { return json(400, { success: false, data: null, error: 'invalid JSON body' }) }
  const built = buildUpstream(body, e)
  if (built.error) return json(400, { success: false, data: null, error: built.error })

  const started = Date.now()
  let r
  try {
    r = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.NVIDIA_API_KEY}`, 'Content-Type': 'application/json', Accept: built.upstream.stream ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify(built.upstream),
      signal: AbortSignal.timeout(120_000),
    })
  } catch {
    return json(504, { success: false, data: null, error: 'NVIDIA API unreachable or timed out' })
  }
  if (built.upstream.stream && r.ok && r.body) {
    return new Response(r.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
  }
  const out = await r.text()
  if (!r.ok) {
    console.error('[nemotron] upstream', r.status, out.slice(0, 300))
    return json(502, { success: false, data: null, error: `NVIDIA API returned ${r.status}` })
  }
  return json(200, { success: true, data: { ...JSON.parse(out), latencyMs: Date.now() - started, model: built.upstream.model }, error: null })
}

export const config = { path: '/api/chat' }
