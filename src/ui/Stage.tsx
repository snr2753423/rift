import { Twin } from '../scene/Twin'
import type { Simulation } from '../sim/simulation'
import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'
import { fmtTime } from './format'
import { DrillCard } from './DrillCard'
import { NemotronPill } from './NemotronPill'
import { Toolbar } from './Toolbar'

function Hud({ sim, label, variant }: { sim: Simulation; label: string; variant: 'base' | 'ai' }) {
  useTicker(8)
  const out = sim.evacuated
  const pct = Math.round((out / sim.n) * 100)
  const inside = sim.n - sim.evacuated - sim.incapacitated
  return (
    <div className={`hud ${variant}`}>
      <div className="hud-top">
        <span className="hud-label">{label}</span>
        <span className="clock num">{fmtTime(sim.t)}</span>
      </div>
      <div className="hud-bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="hud-stats num">
        {sim.done
          ? <span className="done">{inside === 0 && sim.incapacitated === 0 ? 'All clear' : 'Simulation ended'}</span>
          : <span><b>{out}</b> of {sim.n} out</span>}
        {sim.incapacitated > 0 && <span className="warn"> · {sim.incapacitated} exposed</span>}
      </div>
    </div>
  )
}

export function Stage() {
  useRift(s => s.simGen)
  const decision = useRift(s => s.decision)
  const status = useRift(s => s.agentStatus)
  const enteredAt = useRift(s => s.enteredAt)
  const base = live.baseline, ai = live.ai
  if (!base) return <main className="stage" />
  const compare = Boolean(decision && ai)
  const aiLabel = `${decision?.provider === 'fallback' ? 'Offline fallback plan' : "Nemotron's plan"}${status === 'running' ? ' · replanning' : ''}`
  return (
    <main className={`stage ${compare ? 'compare' : ''}`}>
      <div className="view">
        <Twin key={`b-${base.scenario.id}-${base.world.zones.length}-${compare}`} sim={base} routeColor="#a1a1aa" compact={compare} intro={!compare && enteredAt > 0 && performance.now() - enteredAt < 3000} />
        <Hud sim={base} label={compare ? "Today's procedure" : 'Live drill'} variant="base" />
      </div>
      {compare && ai && (
        <div className="view ai">
          <Twin key={`a-${ai.scenario.id}`} sim={ai} routeColor="#76b900" crowdTint="#a6e34a" compact />
          <Hud sim={ai} label={aiLabel} variant="ai" />
        </div>
      )}
      <DrillCard />
      <NemotronPill />
      <Toolbar />
    </main>
  )
}
