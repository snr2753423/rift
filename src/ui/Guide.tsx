import { useState } from 'react'
import { areaName } from '../sim/layout'
import { AgentState, type Simulation } from '../sim/simulation'
import { live, useTicker } from '../state/live'
import { useRift } from '../state/store'

const STEPS = ['Your spot', 'Sound the alarm', 'Watch', 'Ask Nemotron', 'Compare'] as const

/** Where you are in the drill, always visible: five steps, the current one lit. */
export function StepRail() {
  const drill = useRift(s => s.drill)
  const status = useRift(s => s.agentStatus)
  const decision = useRift(s => s.decision)
  const you = useRift(s => s.you)
  const at = decision ? 4 : status === 'running' ? 3 : drill === 'done' ? 3 : drill === 'running' ? 2 : drill === 'ready' && you !== null ? 1 : 0
  return (
    <ol className="steps" aria-label="Drill steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
          <i>{i < at ? '✓' : i + 1}</i><span>{s}</span>
        </li>
      ))}
    </ol>
  )
}

type Tone = 'info' | 'alarm' | 'warn' | 'bad' | 'good' | 'ai'

/** One plain sentence about what is happening on screen right now, read from the live simulation. */
function narrate(sim: Simulation, drill: string, aiBusy: boolean, comparing: boolean, runs: number): { tone: Tone; text: string } {
  if (aiBusy) return { tone: 'ai', text: runs ? `NVIDIA Nemotron has run ${runs} full evacuation${runs > 1 ? 's' : ''} of this floor so far, looking for a plan that saves more people.` : 'NVIDIA Nemotron is studying the floor: exits, rooms, the fire and where everyone is.' }
  if (drill === 'pick') return { tone: 'info', text: 'Every figure is a simulated person. Tap the room you are in, and one of them becomes you.' }
  if (drill === 'ready') return { tone: 'info', text: 'Ready. Sound the alarm and watch how today’s procedure plays out for you.' }
  const L = sim.world.layout
  const ig = [...sim.scenario.ignitions, ...sim.world.extraIgnitions][0]
  const fire = ig ? areaName(ig.cell[0], ig.cell[1], L) : null
  if (sim.done) {
    const lost = sim.n - sim.evacuated // overcome, or still inside when the drill ends
    if (comparing) return { tone: 'ai', text: 'Same fire, same people, two plans: today’s procedure on the left, Nemotron’s on the right.' }
    return lost
      ? { tone: 'bad', text: `Drill over. ${sim.evacuated} of ${sim.n} got out; ${lost} ${lost === 1 ? 'person didn’t' : 'people didn’t'}. Ask Nemotron for a plan that saves them.` }
      : { tone: 'good', text: `Drill over. All ${sim.n} got out. Ask Nemotron whether they could have got out faster and breathed less smoke.` }
  }
  let waiting = 0
  for (let i = 0; i < sim.n; i++) if (sim.state[i] === AgentState.Waiting) waiting++
  const known = L.exits.find(e => e.familiar)?.name
  if (sim.incapacitated > 0 && !comparing) return { tone: 'bad', text: `${sim.incapacitated} ${sim.incapacitated === 1 ? 'person has' : 'people have'} been overcome by smoke.${known ? ` Most people are heading for ${known}, the way they came in.` : ''}` }
  if (sim.t < 4) return { tone: 'alarm', text: `Fire alarm! A fire has broken out${fire ? ` in ${fire}` : ''}.` }
  if (waiting > sim.n * 0.15) return { tone: 'warn', text: `${waiting} people still haven’t started moving. In real fires, this hesitation costs the most lives.` }
  let worst = -1, q = 0
  sim.queue.forEach((v, e) => { if (v > q) { q = v; worst = e } })
  if (q >= 6) return { tone: 'warn', text: `A crowd is forming at ${sim.world.exits[worst].name}: ${q} people queueing while smoke spreads${fire ? ` from ${fire}` : ''}.` }
  return { tone: 'info', text: `${sim.evacuated} of ${sim.n} are out. Smoke is spreading${fire ? ` from ${fire}` : ''}; dashed lines show the routes people are taking.` }
}

export function Caption() {
  useTicker(4)
  const drill = useRift(s => s.drill)
  const busy = useRift(s => s.agentStatus === 'running')
  const decision = useRift(s => s.decision)
  const runs = useRift(s => s.runs.length)
  const sim = live.baseline
  if (!sim) return null
  const ai = live.ai
  const { tone, text } = decision && ai && !busy
    ? { tone: 'ai' as Tone, text: `Same fire, same people. Today: ${sim.evacuated} out${sim.incapacitated ? `, ${sim.incapacitated} overcome` : ''}. Nemotron’s plan: ${ai.evacuated} out${ai.incapacitated ? `, ${ai.incapacitated} overcome` : ai.done && ai.evacuated === ai.n ? ', everyone safe' : ''}.` }
    : narrate(sim, drill, busy, Boolean(decision && ai), runs)
  // keyed by the kind of message (numbers stripped), so it fades in when the story changes, not on every count
  return <p className={`caption ${tone}`} role="status" aria-live="polite" key={tone + text.replace(/\d+/g, '#').slice(0, 28)}>{text}</p>
}

const ITEMS: { cls: string; label: string }[] = [
  { cls: 'you', label: 'You' },
  { cls: 'idle', label: 'Hasn’t reacted yet' },
  { cls: 'moving', label: 'Evacuating' },
  { cls: 'smoke', label: 'Breathing smoke' },
  { cls: 'down', label: 'Overcome' },
  { cls: 'fire', label: 'Fire' },
  { cls: 'haze', label: 'Smoke' },
  { cls: 'exit', label: 'Exit' },
  { cls: 'route', label: 'Route people take' },
]

/** What every colour on the floor means. Open by default; folds away once you know. */
export function Legend() {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 900)
  return (
    <div className={`legend ${open ? 'open' : ''}`}>
      <button className="legend-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide key' : 'What am I looking at?'}</button>
      {open && <ul>{ITEMS.map(it => <li key={it.cls}><i className={`sw ${it.cls}`} aria-hidden />{it.label}</li>)}</ul>}
    </div>
  )
}
