import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'
import type { Metrics } from '../sim/types'
import { delta } from './format'

const CARDS: { key: keyof Metrics; label: string; unit: string; d: number }[] = [
  { key: 't90', label: '90% evacuated', unit: 's', d: 1 },
  { key: 'evacuationTime', label: 'Full evacuation', unit: 's', d: 1 },
  { key: 'totalExposure', label: 'Smoke exposure', unit: 'dose', d: 0 },
  { key: 'congestionIndex', label: 'Crowd-crush time', unit: 'p·s', d: 0 },
]

function Curve({ base, ai }: { base: Metrics; ai: Metrics | null }) {
  useTicker(4)
  const W = 300, H = 64, total = base.total
  const len = Math.max(base.curve.length, ai?.curve.length ?? 0, 10)
  const path = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${((i / (len - 1)) * W).toFixed(1)},${(H - (v / total) * H).toFixed(1)}`).join(' ')
  const t = live.baseline?.t ?? 0
  const x = Math.min(W, (t / (len - 1)) * W)
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="People evacuated over time">
      {[0.5].map(g => <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} className="grid" />)}
      <line x1={0} x2={W} y1={H * 0.1} y2={H * 0.1} className="t90" />
      <path d={path(base.curve)} className="base" />
      {ai && <path d={path(ai.curve)} className="ai" />}
      <line x1={x} x2={x} y1={0} y2={H} className="cursor" />
    </svg>
  )
}

export function Results() {
  const { baseline, decision, baselineBusy } = useRift()
  if (!baseline) return <footer className="results"><div className="results-empty">{baselineBusy ? 'Simulating baseline…' : 'No baseline yet'}</div></footer>
  const ai = decision?.metrics ?? null
  return (
    <footer className="results">
      <div className="metrics">
        {CARDS.map(c => {
          const b = baseline[c.key] as number
          const a = ai ? (ai[c.key] as number) : null
          const d = a !== null ? delta(b, a) : null
          return (
            <div key={c.key} className="metric">
              <span className="metric-label">{c.label}</span>
              <span className={`metric-value ${a !== null ? 'ai' : ''}`}>{(a ?? b).toFixed(c.d)}<small>{c.unit}</small></span>
              <span className="metric-sub num">
                {d ? <><span className={`delta ${d.pct < 0 ? 'good' : d.pct > 0 ? 'bad' : ''}`}>{d.label}</span>from {b.toFixed(c.d)}</> : 'baseline'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="curve-wrap" title="People evacuated over time">
        <div className="curve-legend"><span className="lg base">Baseline</span>{ai && <span className="lg ai">Nemotron</span>}</div>
        <Curve base={baseline} ai={ai} />
        <p className="honesty">Simplified agent-based model, not a certified safety prediction.</p>
      </div>
    </footer>
  )
}
