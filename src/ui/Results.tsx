import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'
import type { Metrics } from '../sim/types'
import { delta } from './format'

const CARDS: { key: keyof Metrics; label: string; unit: string; d: number }[] = [
  { key: 't90', label: '90% evacuated', unit: 's', d: 1 },
  { key: 'evacuationTime', label: 'Full evacuation', unit: 's', d: 1 },
  { key: 'totalExposure', label: 'Smoke exposure', unit: 'dose', d: 0 },
  { key: 'congestionIndex', label: 'Crowd-crush time', unit: 'p·s', d: 0 },
  { key: 'incapacitated', label: 'High-exposure', unit: 'people', d: 0 },
]

function Curve({ base, ai }: { base: Metrics; ai: Metrics | null }) {
  useTicker(4)
  const W = 300, H = 92, total = base.total
  const len = Math.max(base.curve.length, ai?.curve.length ?? 0, 10)
  const path = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${((i / (len - 1)) * W).toFixed(1)},${(H - (v / total) * H).toFixed(1)}`).join(' ')
  const t = live.baseline?.t ?? 0
  const x = Math.min(W, (t / (len - 1)) * W)
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="People evacuated over time">
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} className="grid" />)}
      <line x1={0} x2={W} y1={H * 0.1} y2={H * 0.1} className="t90" />
      <path d={path(base.curve)} className="base" />
      {ai && <path d={path(ai.curve)} className="ai" />}
      <line x1={x} x2={x} y1={0} y2={H} className="cursor" />
    </svg>
  )
}

export function Results() {
  const { baseline, decision, baselineBusy, agentStatus } = useRift()
  if (!baseline) return <footer className="results"><div className="results-empty mono">{baselineBusy ? 'Simulating baseline…' : 'No baseline yet'}</div></footer>
  const ai = decision?.metrics ?? null
  return (
    <footer className="results">
      <div className="cards">
        {CARDS.map(c => {
          const b = baseline[c.key] as number
          const a = ai ? (ai[c.key] as number) : null
          const d = a !== null ? delta(b, a) : null
          const better = d && (c.key === 'incapacitated' ? a! < b : d.pct < 0)
          const worse = d && (c.key === 'incapacitated' ? a! > b : d.pct > 0)
          return (
            <div key={c.key} className="card">
              <span className="card-label">{c.label}</span>
              <div className="card-vals">
                <span className="v base mono">{b.toFixed(c.d)}</span>
                {a !== null && <><span className="arrow">→</span><span className="v ai mono">{a.toFixed(c.d)}</span></>}
                <span className="unit">{c.unit}</span>
              </div>
              {d && <span className={`pill ${better ? 'good' : worse ? 'bad' : ''}`}>{c.key === 'incapacitated' ? `${a! - b > 0 ? '+' : ''}${a! - b}` : d.label}</span>}
            </div>
          )
        })}
      </div>
      <div className="curve-wrap">
        <div className="curve-legend mono"><span className="lg base">baseline</span>{ai && <span className="lg ai">RIFT AI</span>}<span className="muted">people out vs time · computed</span></div>
        <Curve base={baseline} ai={ai} />
      </div>
      <p className="honesty">{agentStatus === 'running' ? 'Agent re-planning — cards update when it commits. ' : ''}Metrics computed from deterministic agent-based simulation runs (Weidmann speed–density, cellular fire/smoke). Simplified model for strategy exploration — not a certified safety prediction.</p>
    </footer>
  )
}
