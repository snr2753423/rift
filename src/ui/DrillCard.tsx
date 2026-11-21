import { outcomeOf, personInZone, youIn, type Outcome, type You } from '../sim/outcome'
import { engageAgent } from '../state/actions'
import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'
import { loadCampus } from '../campus/data'
import { openFloor } from '../campus/open'
import { fmtTime } from './format'

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

function youLine(y: You) {
  if (y.status === 'out') return `Out in ${fmtTime(y.time ?? 0)} via ${y.exit}`
  if (y.status === 'overcome') return 'Overcome by smoke'
  if (y.status === 'moving') return `Heading for ${y.heading ?? 'an exit'}`
  return 'Not moving yet: still working out what the bell means'
}

function Picker() {
  const sim = live.baseline
  const set = useRift(s => s.set)
  if (!sim) return null
  const rooms = sim.world.zones.map((z, i) => ({ z, i })).filter(({ z }) => !/corridor/i.test(z.name))
  return (
    <>
      <span className="step">Step 1 · Your spot</span>
      <h3>Where are you when the alarm goes off?</h3>
      <p>Tap a room on the floor plan, or pick one here.</p>
      <div className="room-chips">
        {rooms.map(({ z, i }) => (
          <button key={z.id} onClick={() => { const who = personInZone(sim, i); if (who >= 0) set({ you: who, youRoom: z.name, drill: 'ready' }) }}>{z.name}</button>
        ))}
      </div>
    </>
  )
}

function Ready() {
  const { youRoom, floor, set, restart } = useRift()
  return (
    <>
      <span className="step">Step 2 · Sound the alarm</span>
      <h3>You're in {youRoom}, floor {floor}.</h3>
      <p>Everyone around you follows today's procedure: a bell, then the way they came in. You'll see a maroon ring on yourself.</p>
      <div className="actions">
        <button className="btn alarm" onClick={restart}><span className="bell" aria-hidden />Sound the fire alarm</button>
        <button className="btn ghost" onClick={() => set({ you: null, youRoom: null, drill: 'pick' })}>Move</button>
      </div>
    </>
  )
}

function Running() {
  useTicker(6)
  const you = useRift(s => s.you)
  const decision = useRift(s => s.decision)
  const b = live.baseline, a = live.ai
  if (!b || you === null) return null
  const yb = youIn(b, you), ya = a ? youIn(a, you) : null
  return (
    <>
      <span className="step">{decision ? 'Step 5 · Both plans, same fire' : 'Step 3 · Watch yourself evacuate'}</span>
      <div className="you-live">
        <div><b>{decision ? "Today's plan" : 'You'}</b><span>{youLine(yb)}</span></div>
        {ya && <div className="nv"><b>Nemotron's plan</b><span>{youLine(ya)}</span></div>}
      </div>
      <div className="meters">
        <Meter label="Smoke breathed" v={yb.smoke} />
        <Meter label="Time in a crush" v={Math.min(1, yb.crush / 30)} text={`${Math.round(yb.crush)}s`} />
      </div>
    </>
  )
}

function Meter({ label, v, text }: { label: string; v: number; text?: string }) {
  const level = v > 0.66 ? 'bad' : v > 0.33 ? 'warn' : ''
  return <div className={`meter ${level}`}><span>{label}</span><i><b style={{ width: `${Math.min(100, v * 100)}%` }} /></i><em>{text ?? `${Math.round(v * 100)}%`}</em></div>
}

function Headline({ y }: { y: You }) {
  if (y.status === 'out') return <h3 className="good">You got out in {fmtTime(y.time ?? 0)}</h3>
  if (y.status === 'overcome') return <h3 className="bad">You didn't make it out</h3>
  return <h3 className="warn">You were still inside when the drill ended</h3>
}

function Result() {
  const you = useRift(s => s.you)
  const status = useRift(s => s.agentStatus)
  const set = useRift(s => s.set)
  const b = live.baseline
  if (!b || you === null) return null
  const y = youIn(b, you), o = outcomeOf(b)
  return (
    <>
      <span className="step">Step 4 · Your result, then ask Nemotron</span>
      <Headline y={y} />
      <p>{y.exit ? `Via ${y.exit}. ` : ''}{Math.round(y.crush)}s packed in a crowd, {Math.round(Math.min(1, y.smoke) * 100)}% of a dangerous smoke dose.</p>
      <div className="facts">
        <div className={o.casualties ? 'bad' : ''}><b>{o.casualties}</b><span>people overcome</span></div>
        <div className={o.injured ? 'warn' : ''}><b>{o.injured}</b><span>hurt by smoke</span></div>
        <div><b>{o.crushPerPerson.toFixed(0)}s</b><span>avg. time in a crush</span></div>
      </div>
      <div className="actions">
        <button className="btn nvidia" disabled={status === 'running'} onClick={() => engageAgent()}>
          {status === 'running' ? 'Nemotron is planning…' : 'Ask NVIDIA Nemotron for a better plan'}
        </button>
        <button className="btn ghost" onClick={() => set({ you: null, youRoom: null, drill: 'pick' })}>Try another spot</button>
      </div>
    </>
  )
}

type Row = { label: string; b: number; a: number; fmt: (v: number) => string; lowerIsBetter: boolean; hint?: string }

function Scoreboard() {
  const you = useRift(s => s.you)
  const { restart, set } = useRift()
  const b = live.baseline, a = live.ai
  if (!b || !a || you === null) return null
  const ob: Outcome = outcomeOf(b), oa: Outcome = outcomeOf(a)
  const yb = youIn(b, you), ya = youIn(a, you)
  const youTime = (y: You) => (y.status === 'out' ? y.time ?? 999 : 999)
  const rows: Row[] = [
    { label: 'Your escape', b: youTime(yb), a: youTime(ya), fmt: v => (v >= 999 ? 'Did not escape' : fmtTime(v)), lowerIsBetter: true },
    { label: 'Casualty rate', b: pct(ob.casualties, ob.total), a: pct(oa.casualties, oa.total), fmt: v => `${v}%`, lowerIsBetter: true, hint: 'overcome by smoke or fire' },
    { label: 'Hurt by smoke', b: ob.injured, a: oa.injured, fmt: v => `${v}`, lowerIsBetter: true },
    { label: 'Chaos', b: ob.crushPerPerson, a: oa.crushPerPerson, fmt: v => `${v.toFixed(1)}s`, lowerIsBetter: true, hint: 'avg. seconds each person spent in a crush' },
    { label: '90% out', b: ob.t90 ?? 999, a: oa.t90 ?? 999, fmt: v => (v >= 999 ? 'never' : fmtTime(v)), lowerIsBetter: true },
  ]
  const wins = rows.filter(r => r.a < r.b).length, losses = rows.filter(r => r.a > r.b).length
  const verdict = losses === 0 && wins > 0 ? 'Nemotron\'s plan is better on every count that changed.' : wins === 0 ? 'Nemotron could not beat today\'s procedure here.' : `A trade-off: better on ${wins}, worse on ${losses}.`
  return (
    <>
      <span className="step">Today's procedure vs. Nemotron's plan</span>
      <h3>{verdict}</h3>
      <table className="score">
        <thead><tr><th /><th>Today</th><th className="nv">Nemotron</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const better = r.a < r.b, worse = r.a > r.b
            return (
              <tr key={r.label} title={r.hint}>
                <td>{r.label}{r.hint && <small>{r.hint}</small>}</td>
                <td className={better ? 'lose' : ''}>{r.fmt(r.b)}</td>
                <td className={`nv ${better ? 'win' : worse ? 'worse' : ''}`}>{r.fmt(r.a)}{better ? ' ▼' : worse ? ' ▲' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="fine">Fire damage is the same under both plans ({Math.round(ob.fireDamage * 100)}% of this floor): the plan changes how people move, not how the fire spreads.</p>
      <div className="actions">
        <button className="btn" onClick={restart}>Watch again</button>
        <button className="btn ghost" onClick={() => set({ you: null, youRoom: null, drill: 'pick' })}>Try another spot</button>
      </div>
      <WhatNext />
    </>
  )
}

/** Where to go once both plans have played out, so the story never just stops. */
function WhatNext() {
  const { building, floor, floors, set } = useRift()
  const done = useRift(s => s.drill === 'done')
  const next = floor < floors ? floor + 1 : floors > 1 ? 1 : null
  const goFloor = async (f: number) => {
    const spot = (await loadCampus()).spots.find(x => x.name === building)
    if (spot) await openFloor(spot, f)
  }
  return (
    <div className={`next ${done ? 'ready' : ''}`}>
      <span className="next-title">What next?</span>
      <div className="next-grid">
        <button className="next-card nv" onClick={() => set({ tool: 'block' })}>
          <b>Throw a curveball</b><span>Block an exit and watch Nemotron replan on its own</span>
        </button>
        {building && next && (
          <button className="next-card" onClick={() => void goFloor(next)}>
            <b>Floor {next}</b><span>{next > 1 ? 'Upstairs, people leave by the stairwells' : 'Back to the ground floor'}</span>
          </button>
        )}
        <button className="next-card" onClick={() => set({ view: 'campus' })}>
          <b>Another building</b><span>Back to the campus map</span>
        </button>
      </div>
    </div>
  )
}

export function DrillCard() {
  useTicker(3)
  const drill = useRift(s => s.drill)
  const decision = useRift(s => s.decision)
  const you = useRift(s => s.you)
  const status = useRift(s => s.agentStatus)
  if (!live.baseline) return null
  const body = drill === 'pick' || you === null ? <Picker /> : drill === 'ready' ? <Ready /> : drill === 'running' ? <Running /> : decision && live.ai ? <Scoreboard /> : <Result />
  return <div className={`drill ${drill} ${decision && drill === 'done' ? 'wide' : ''} ${status === 'running' ? 'busy' : ''}`}>{body}</div>
}
