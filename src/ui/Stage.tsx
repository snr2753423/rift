import { Twin } from '../scene/Twin'
import type { Simulation } from '../sim/simulation'
import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'
import { fmtTime } from './format'

function Hud({ sim, label, variant }: { sim: Simulation; label: string; variant: 'base' | 'ai' }) {
  useTicker(8)
  const out = sim.evacuated
  const pct = Math.round((out / sim.n) * 100)
  const inside = sim.n - sim.evacuated - sim.incapacitated
  return (
    <div className={`hud ${variant}`}>
      <div className="hud-top">
        <span className="hud-label">{label}</span>
        <span className="clock mono">T+{fmtTime(sim.t)}</span>
      </div>
      <div className="hud-bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="hud-stats mono">
        <span><b>{out}</b>/{sim.n} out</span>
        <span><b>{inside}</b> inside</span>
        <span className={sim.incapacitated ? 'warn' : ''}><b>{sim.incapacitated}</b> high-exposure</span>
        {sim.done && <span className="done">{sim.incapacitated + inside === 0 ? 'ALL CLEAR' : 'SIM END'}</span>}
      </div>
    </div>
  )
}

export function Stage() {
  useRift(s => s.simGen)
  const decision = useRift(s => s.decision)
  const status = useRift(s => s.agentStatus)
  const base = live.baseline, ai = live.ai
  if (!base) return <main className="stage" />
  const compare = Boolean(decision && ai)
  return (
    <main className={`stage ${compare ? 'compare' : ''}`}>
      <div className="view">
        <Twin key={`b-${base.scenario.id}-${base.world.zones.length}-${compare}`} sim={base} routeColor="#b8c7d9" compact={compare} />
        <Hud sim={base} label={compare ? 'BASELINE · unguided self-evacuation' : 'LIVE TWIN · unguided baseline'} variant="base" />
      </div>
      {compare && ai && (
        <div className="view ai">
          <Twin key={`a-${ai.scenario.id}`} sim={ai} routeColor="#3ddc84" crowdTint="#7dffb2" compact />
          <Hud sim={ai} label={`RIFT AI · ${decision!.provider === 'fallback' ? 'fallback plan' : 'Nemotron-optimised'}${status === 'running' ? ' · replanning…' : ''}`} variant="ai" />
        </div>
      )}
    </main>
  )
}
