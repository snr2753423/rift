import { useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '../agent/loop'
import { cancelAgent, engageAgent } from '../state/actions'
import { useRift } from '../state/store'

const MODEL = 'nemotron-3.5-super-vl-120b-a12b'

function argsSummary(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  const parts: string[] = []
  if (a.name) parts.push(`“${String(a.name)}”`)
  if (a.run_id) parts.push(String(a.run_id))
  for (const k of ['zoneAssignments', 'exitBias', 'zoneDelays'] as const) {
    const v = a[k] as Record<string, unknown> | undefined
    if (v && Object.keys(v).length) parts.push(`${k}: ${Object.entries(v).map(([z, e]) => `${z}→${e}`).join(', ')}`)
  }
  for (const k of ['hazardAversion', 'congestionAwareness', 'reassessInterval'] as const) if (a[k] !== undefined) parts.push(`${k}=${String(a[k])}`)
  return parts.join(' · ')
}

function ResultChips({ result }: { result: unknown }) {
  const r = result as Record<string, unknown> | null
  if (!r) return null
  if (r.error) return <div className="chip bad">{String(r.error)}</div>
  const m = r.metrics as Record<string, unknown> | undefined
  const d = r.vs_baseline as Record<string, string | number> | undefined
  if (m && d) {
    const good = (s: string | number) => (typeof s === 'string' ? s.startsWith('-') : Number(s) < 0)
    return (
      <div className="chips">
        <span className="chip id">{String(r.run_id)}</span>
        <span className="chip">evac {String(m.evacuation_time_s)}s <em className={good(d.evacuation_time) ? 'up' : 'down'}>{String(d.evacuation_time)}</em></span>
        <span className="chip">t90 {String(m.t90_s)}s <em className={good(d.t90) ? 'up' : 'down'}>{String(d.t90)}</em></span>
        <span className="chip">smoke <em className={good(d.smoke_exposure) ? 'up' : 'down'}>{String(d.smoke_exposure)}</em></span>
        <span className="chip">crush <em className={good(d.crowd_crush) ? 'up' : 'down'}>{String(d.crowd_crush)}</em></span>
        <span className="chip mono">{String(r.compute_ms)}ms sim</span>
      </div>
    )
  }
  if (r.exit_load_ranked) {
    const top = (r.exit_load_ranked as { id: string; min_clearance_s: number }[]).slice(0, 3)
    return <div className="chips">{top.map(e => <span key={e.id} className="chip">{e.id} {e.min_clearance_s}s</span>)}</div>
  }
  if (r.exits) return <div className="chips"><span className="chip">{(r.exits as unknown[]).length} exits</span><span className="chip">{(r.zones as unknown[]).length} zones</span><span className="chip">baseline loaded</span></div>
  if (r.strategy && r.evacuation_time_s !== undefined) return <div className="chips"><span className="chip">“{String(r.strategy)}” now</span><span className="chip">evac {String(r.evacuation_time_s)}s</span><span className="chip">t90 {String(r.t90_s)}s</span><span className="chip">{String(r.incapacitated)} high-exposure</span></div>
  if (r.ok) return <div className="chips"><span className="chip id">committed {String(r.committed)}</span></div>
  return <div className="chips"><span className="chip mono">{JSON.stringify(r).slice(0, 120)}</span></div>
}

function EventRow({ e }: { e: AgentEvent }) {
  const [open, setOpen] = useState(false)
  if (e.kind === 'status') return <li className="ev status"><span className="dot" />{e.text}</li>
  if (e.kind === 'thought') return (
    <li className={`ev thought ${e.streaming ? 'live' : ''}`} onClick={() => setOpen(o => !o)}>
      <header><span className="tag">REASONING</span>{e.streaming ? <span className="meta live-meta">streaming · {e.text.length} chars</span> : e.latencyMs ? <span className="meta">{(e.latencyMs / 1000).toFixed(1)}s · {e.tokens ?? '—'} tok</span> : null}</header>
      <p className={e.streaming ? 'tail' : open ? 'full' : 'clamp'}>{e.streaming ? e.text.slice(-420) : e.text}</p>
    </li>
  )
  if (e.kind === 'say') return <li className="ev say"><p>{e.text}</p></li>
  if (e.kind === 'tool_call') return (
    <li className="ev call"><header><span className="tag">CALL</span><code>{e.tool}()</code></header>{argsSummary(e.args) && <p className="mono small">{argsSummary(e.args)}</p>}</li>
  )
  if (e.kind === 'tool_result') return <li className="ev result"><header><span className="tag">RESULT</span><code>{e.tool}</code></header><ResultChips result={e.result} /></li>
  if (e.kind === 'error') return <li className="ev error"><p>{e.text}</p></li>
  const r = e.result as { rationale: string; changes: string[]; run: string }
  return (
    <li className="ev decision">
      <header><span className="tag">COMMITTED · {r.run}</span></header>
      <h4>{e.text}</h4>
      <p>{r.rationale}</p>
      {r.changes.length > 0 && <ul>{r.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
    </li>
  )
}

export function AgentPanel() {
  const { events, agentStatus, provider, runs, baseline, decision } = useRift()
  const list = useRef<HTMLOListElement>(null)
  const lastLen = events[events.length - 1]?.text.length ?? 0
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [events.length, lastLen])
  const calls = events.filter(e => e.kind === 'tool_call').length
  const latency = events.reduce((s, e) => s + (e.kind === 'thought' || e.kind === 'say' ? e.latencyMs ?? 0 : 0), 0)
  const tokens = events.reduce((s, e) => s + (e.tokens ?? 0), 0)
  return (
    <aside className="rail right agent">
      <header className="agent-head">
        <div>
          <span className="eyebrow">Autonomous agent</span>
          <h2>Nemotron Planner</h2>
          <code className="model">nvidia/{MODEL}</code>
        </div>
        <span className={`badge ${provider ?? 'idle'} ${agentStatus}`}>
          {agentStatus === 'running' ? 'RUNNING' : provider === 'fallback' ? 'DEMO FALLBACK' : provider === 'nemotron' ? 'LIVE · NIM' : 'STANDBY'}
        </span>
      </header>
      <div className="agent-actions">
        {agentStatus === 'running'
          ? <button className="btn ghost" onClick={cancelAgent}>Stop agent</button>
          : <button className="btn primary" disabled={!baseline} onClick={() => engageAgent()}>{decision ? 'Re-optimise' : 'Engage Nemotron'}</button>}
        <div className="agent-stats mono">
          <span>{calls} tool calls</span><span>{runs.length} sims</span><span>{(latency / 1000).toFixed(1)}s model · {(tokens / 1000).toFixed(1)}k tok</span>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="agent-empty">
          <p>The agent reads the digital twin, proposes evacuation strategies, <b>runs real simulations</b> to test them, analyses bottlenecks and commits the best plan — explaining it with measured numbers.</p>
          <ol>
            <li><code>inspect_environment</code></li>
            <li><code>run_simulation</code> × 3–6</li>
            <li><code>analyze_bottlenecks</code></li>
            <li><code>commit_strategy</code></li>
          </ol>
          <p className="muted">Drop an obstacle after it commits — it replans on its own.</p>
        </div>
      ) : (
        <ol className="events" ref={list}>{events.map(e => <EventRow key={e.id} e={e} />)}{agentStatus === 'running' && <li className="ev pending"><span className="shimmer">working</span></li>}</ol>
      )}
    </aside>
  )
}
