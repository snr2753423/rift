import { useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '../agent/loop'
import { cancelAgent, engageAgent } from '../state/actions'
import { useRift } from '../state/store'

const MODEL = 'nemotron-3.5-super-vl-120b-a12b'

const TOOL_LABELS: Record<string, string> = {
  inspect_environment: 'Inspect the building',
  run_simulation: 'Test a strategy',
  analyze_bottlenecks: 'Find bottlenecks',
  commit_strategy: 'Commit the plan',
  evaluate_current_plan: 'Re-test the current plan',
}
const toolLabel = (t?: string) => (t && TOOL_LABELS[t]) ?? t ?? 'Tool call'

function argsSummary(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  const parts: string[] = []
  for (const k of ['zoneAssignments', 'exitBias', 'zoneDelays'] as const) {
    const v = a[k] as Record<string, unknown> | undefined
    if (v && Object.keys(v).length) parts.push(`${k}: ${Object.entries(v).map(([z, e]) => `${z}→${e}`).join(', ')}`)
  }
  for (const k of ['hazardAversion', 'congestionAwareness', 'reassessInterval'] as const) if (a[k] !== undefined) parts.push(`${k}=${String(a[k])}`)
  return parts.join(' · ')
}

const isGood = (s: string | number) => (typeof s === 'string' ? s.startsWith('-') : Number(s) < 0)

function Delta({ v }: { v: string | number | undefined }) {
  if (v === undefined) return null
  return <span className={`delta ${isGood(v) ? 'good' : 'bad'}`}>{String(v)}</span>
}

function ResultLine({ result }: { result: unknown }) {
  const r = result as Record<string, unknown> | null
  if (!r) return null
  if (r.error) return <p className="delta bad">{String(r.error)}</p>
  const m = r.metrics as Record<string, unknown> | undefined
  const d = r.vs_baseline as Record<string, string | number> | undefined
  if (m && d) return (
    <div className="run num">
      <b>{String(r.run_id)}</b>
      <span>{String(m.evacuation_time_s)}s <Delta v={d.evacuation_time} /></span>
      <span>smoke <Delta v={d.smoke_exposure} /></span>
      <span>crush <Delta v={d.crowd_crush} /></span>
    </div>
  )
  if (r.exit_load_ranked) {
    const top = (r.exit_load_ranked as { id: string; min_clearance_s: number }[]).slice(0, 2)
    return <p className="tagline">Slowest exits: {top.map(e => `${e.id} (${e.min_clearance_s}s)`).join(', ')}</p>
  }
  if (r.exits) return <p className="tagline">{(r.exits as unknown[]).length} exits, {(r.zones as unknown[]).length} zones, baseline loaded</p>
  if (r.strategy && r.evacuation_time_s !== undefined) return <p className="tagline">“{String(r.strategy)}” now takes {String(r.evacuation_time_s)}s</p>
  if (r.ok) return null
  return null
}

function EventRow({ e }: { e: AgentEvent }) {
  const [open, setOpen] = useState(false)
  if (e.kind === 'status') return <li className="ev status">{e.text}</li>
  if (e.kind === 'thought') return (
    <li className={`ev thought ${e.streaming ? 'live' : ''}`} onClick={() => setOpen(o => !o)}>
      <div className="ev-row">
        <span className="ev-title">{e.streaming ? 'Thinking' : 'Reasoned'}</span>
        <span className="ev-meta">{e.streaming ? `${e.text.length} chars` : e.latencyMs ? `${(e.latencyMs / 1000).toFixed(1)}s · ${e.tokens ?? '—'} tok` : ''}</span>
      </div>
      <p className={e.streaming ? 'tail' : open ? 'full' : 'clamp'}>{e.streaming ? e.text.slice(-420) : e.text}</p>
    </li>
  )
  if (e.kind === 'say') return <li className="ev say"><p>{e.text}</p></li>
  if (e.kind === 'tool_call') {
    const a = e.args as Record<string, unknown> | undefined
    const detail = argsSummary(e.args)
    return (
      <li className="ev call">
        <div className="ev-row"><span className="ev-title">{toolLabel(e.tool)}</span><span className="ev-meta">{e.tool}</span></div>
        {a?.name ? <p>“{String(a.name)}”</p> : null}
        {detail && <details><summary>Parameters</summary><code>{detail}</code></details>}
      </li>
    )
  }
  if (e.kind === 'tool_result') return <li className="ev result"><ResultLine result={e.result} /></li>
  if (e.kind === 'error') return <li className="ev error"><p>{e.text}</p></li>
  const r = e.result as { rationale: string; changes: string[]; run: string }
  return (
    <li className="ev decision">
      <div className="decision-card">
        <span className="eyebrow">Committed · {r.run}</span>
        <h4>{e.text}</h4>
        <p>{r.rationale}</p>
        {r.changes.length > 0 && <ul>{r.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
      </div>
    </li>
  )
}

export function AgentPanel() {
  const { events, agentStatus, runs, baseline, decision } = useRift()
  const list = useRef<HTMLOListElement>(null)
  const lastLen = events[events.length - 1]?.text.length ?? 0
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [events.length, lastLen])
  const calls = events.filter(e => e.kind === 'tool_call').length
  const tokens = events.reduce((s, e) => s + (e.tokens ?? 0), 0)
  const running = agentStatus === 'running'
  return (
    <aside className="agent">
      <header className="agent-head">
        <div>
          <h2>Nemotron agent</h2>
          <p className="sub mono">{MODEL}</p>
        </div>
      </header>
      <div className="agent-action">
        {running
          ? <button className="btn block" onClick={cancelAgent}>Stop agent</button>
          : <button className="btn primary block" disabled={!baseline} onClick={() => engageAgent()}>{decision ? 'Re-optimise' : 'Optimise evacuation'}</button>}
        {events.length > 0 && (
          <div className="agent-stats num"><span>{calls} tool calls</span><span>{runs.length} simulations</span><span>{(tokens / 1000).toFixed(1)}k tokens</span></div>
        )}
      </div>
      {events.length === 0 ? (
        <div className="agent-empty">
          <p>Nemotron plans the evacuation by running real simulations, not by guessing.</p>
          <ol>
            <li><div>Inspects the twin<span>Exits, zones, fire and crowd</span></div></li>
            <li><div>Tests strategies in parallel<span>Each one is a full simulation run</span></div></li>
            <li><div>Commits the best plan<span>Only if it beats the baseline</span></div></li>
          </ol>
        </div>
      ) : (
        <ol className="events" ref={list}>
          {events.map(e => <EventRow key={e.id} e={e} />)}
          {running && <li className="ev pending">Working…</li>}
        </ol>
      )}
    </aside>
  )
}
