import type { Metrics, Modification, Scenario, Strategy } from '../sim/types'

type Reply = { id: number; metrics?: Metrics; ms?: number; error?: string }
const POOL_SIZE = 3
const pool: Worker[] = []
let seq = 0
let rr = 0
const pending = new Map<number, { worker: Worker; resolve: (v: { metrics: Metrics; ms: number }) => void; reject: (e: Error) => void }>()

function onReply(e: MessageEvent<Reply>) {
  const p = pending.get(e.data.id)
  if (!p) return
  pending.delete(e.data.id)
  if (e.data.error || !e.data.metrics) p.reject(new Error(e.data.error ?? 'simulation failed'))
  else p.resolve({ metrics: e.data.metrics, ms: e.data.ms ?? 0 })
}

function nextWorker(): Worker {
  if (pool.length < POOL_SIZE) {
    const w = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = onReply
    w.onerror = ev => {
      // worker failed to load or crashed: fail its jobs and drop it so the next call spawns a fresh one
      console.error('simulation worker error', ev.message)
      for (const [id, p] of pending) if (p.worker === w) { pending.delete(id); p.reject(new Error('simulation worker crashed')) }
      pool.splice(pool.indexOf(w), 1)
      w.terminate()
    }
    pool.push(w)
    return w
  }
  return pool[rr++ % pool.length]
}

/** Run a full headless simulation on a small Web Worker pool, so parallel tool calls really run in parallel. */
export function simulate(scenario: Scenario, mods: Modification[], strategy: Strategy) {
  const id = ++seq
  return new Promise<{ metrics: Metrics; ms: number }>((resolve, reject) => {
    const w = nextWorker()
    pending.set(id, { worker: w, resolve, reject })
    w.postMessage({ id, scenario, mods, strategy })
  })
}
