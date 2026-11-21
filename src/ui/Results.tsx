import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'
import type { Metrics } from '../sim/types'

type Card = { label: string; hint: string; get: (m: Metrics) => number; fmt: (v: number) => string; unit?: string }

// everything here is "lower is better"
const CARDS: Card[] = [
  { label: 'People lost', hint: 'overcome, or still inside at the end', get: m => m.incapacitated + m.remaining, fmt: v => String(Math.round(v)) },
  { label: 'Chaos', hint: 'crowd crush, person-seconds above 2.5 people/m²', get: m => m.congestionIndex, fmt: v => Math.round(v).toLocaleString() },
  { label: 'Smoke breathed', hint: 'average smoke dose per person', get: m => m.meanExposure, fmt: v => v.toFixed(1) },
  { label: 'Everyone out', hint: 'time until 90% have left', get: m => m.t90, fmt: v => v.toFixed(0), unit: 's' },
]

function Curve({ base, ai }: { base: Metrics; ai: Metrics | null }) {
  useTicker(4)
  const W = 300, H = 64, total = base.total
  const len = Math.max(base.curve.length, ai?.curve.length ?? 0, 10)
  const path = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${((i / (len - 1)) * W).toFixed(1)},${(H - (v / total) * H).toFixed(1)}`).join(' ')
  const t = live.baseline?.t ?? 0
  const x = Math.min(W, (t / (len - 1)) * W)
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="People out of the building over time">
      <line x1={0} x2={W} y1={H * 0.5} y2={H * 0.5} className="grid" />
      <line x1={0} x2={W} y1={H * 0.1} y2={H * 0.1} className="t90" />
      <path d={path(base.curve)} className="base" />
      {ai && <path d={path(ai.curve)} className="ai" />}
      <line x1={x} x2={x} y1={0} y2={H} className="cursor" />
    </svg>
  )
}

export function Results() {
  const { baseline, decision, baselineBusy, drill } = useRift()
  if (!baseline) return <footer className="results"><div className="results-empty">{baselineBusy ? 'Simulating today’s procedure…' : 'No drill yet'}</div></footer>
  // no spoilers: today's numbers land when the drill ends
  if (!decision && drill !== 'done') return <footer className="results"><div className="results-empty">{drill === 'running' ? 'Drill in progress. Lives, time, smoke and crowding land here when it ends, each measured in the simulation.' : 'Your results land here after the drill: lives, time, smoke and crowding, each measured in the simulation.'}</div></footer>
  const ai = decision?.metrics ?? null
  const fallback = decision?.provider === 'fallback'
  return (
    <footer className="results">
      <div className="metrics">
        {CARDS.map(c => {
          const b = c.get(baseline), a = ai ? c.get(ai) : null
          // compare what is shown: a difference that rounds away is no change
          const same = a !== null && c.fmt(a) === c.fmt(b)
          const better = a !== null && !same && a < b, worse = a !== null && !same && a > b
          return (
            <div key={c.label} className={`metric ${better ? 'win' : worse ? 'worse' : ''}`} title={c.hint}>
              <span className="metric-label">{c.label}</span>
              {a === null || same ? (
                <span className="metric-value">{c.fmt(b)}<small>{c.unit}</small></span>
              ) : (
                <div className="vs">
                  <span className="was">{c.fmt(b)}{c.unit}</span>
                  <span className="arrow" aria-hidden>→</span>
                  <span className="metric-value nv">{c.fmt(a)}<small>{c.unit}</small></span>
                </div>
              )}
              <span className="metric-sub">{a === null ? `today · ${c.hint}` : better ? `${fallback ? 'fallback' : 'Nemotron'} is better` : worse ? 'the trade-off' : 'no change'}</span>
            </div>
          )
        })}
      </div>
      <div className="curve-wrap" title="People out of the building over time">
        <div className="curve-legend"><span className="lg base">Today</span>{ai && <span className="lg ai">{fallback ? 'Fallback' : 'Nemotron'}</span>}<span className="spacer" /><span>people out</span></div>
        <Curve base={baseline} ai={ai} />
        <p className="honesty">Simplified simulation for comparing plans, not a certified safety prediction.</p>
      </div>
    </footer>
  )
}
