import { useEffect, useState } from 'react'
import { useBoot, type BootTask, type TaskState } from './boot'
import { Wordmark } from './Wordmark'

const MIN_MS = 2200 // long enough for the little drill below to play through once
const MAX_MS = 14000 // never trap anyone behind the loader
const OUT_MS = 800

const ROWS: { task: BootTask; label: (s: TaskState) => string }[] = [
  { task: 'data', label: s => (s === 'warn' ? 'Campus map unavailable' : 'Mapping Texas A&M from OpenStreetMap') },
  { task: 'map', label: () => 'Raising the campus in 3D' },
  { task: 'nemotron', label: s => (s === 'ok' ? 'NVIDIA Nemotron online' : s === 'warn' ? 'Nemotron offline: labelled fallback ready' : 'Connecting to NVIDIA Nemotron') },
]

// a tiny floor plan: today everyone heads for the familiar door by the fire; Nemotron's route takes the far exit
const WALLS = 'M40 30 H320 V88 M320 122 V170 H134 M88 170 H40 V30'
const ROOMS = 'M120 30 V78 M200 30 V78 M262 30 V78 M180 122 V170 M252 122 V170 M40 78 H104 M136 78 H184 M216 78 H246 M278 78 H320 M40 122 H160 M196 122 H236 M268 122 H320'
const TODAY = 'M78 54 L78 100 L338 104'
const NEMO = 'M232 54 L232 100 L112 100 L112 190'

function Drill() {
  return (
    <svg className="boot-drill" viewBox="0 0 360 200" aria-hidden>
      <path className="b-walls" d={WALLS} />
      <path className="b-rooms" d={ROOMS} />
      <circle className="b-fire glow" cx="292" cy="146" r="16" />
      <circle className="b-fire core" cx="292" cy="146" r="6" />
      <path className="b-route today" d={TODAY} />
      <path className="b-route nemo" d={NEMO} />
      {[0, 0.35, 0.7, 1.05].map(d => (
        <circle key={`t${d}`} className="b-person today" r="3.4">
          <animateMotion dur="2.4s" begin={`${0.5 + d}s`} repeatCount="indefinite" path={TODAY} />
        </circle>
      ))}
      {[0, 0.35, 0.7, 1.05].map(d => (
        <circle key={`n${d}`} className="b-person nemo" r="3.4">
          <animateMotion dur="2.4s" begin={`${1.3 + d}s`} repeatCount="indefinite" path={NEMO} />
        </circle>
      ))}
      <text className="b-tag today" x="334" y="80">usual exit</text>
      <text className="b-tag nemo" x="112" y="198">safer exit</text>
    </svg>
  )
}

/** Branded loading screen that waits on real work (map data, the 3D scene's first frames, Nemotron connectivity). */
export function Loader() {
  const tasks = useBoot(s => s.tasks)
  const reveal = useBoot(s => s.reveal)
  const [t0] = useState(() => performance.now())
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in')
  const all = (Object.values(tasks) as TaskState[]).filter(s => s !== 'wait').length
  const total = Object.keys(tasks).length
  const ready = all === total

  useEffect(() => {
    if (phase !== 'in') return
    const wait = ready ? Math.max(0, MIN_MS - (performance.now() - t0)) : Math.max(0, MAX_MS - (performance.now() - t0))
    const id = window.setTimeout(() => setPhase('out'), wait)
    return () => window.clearTimeout(id)
  }, [ready, phase, t0])
  useEffect(() => {
    if (phase !== 'out') return
    reveal()
    const id = window.setTimeout(() => setPhase('gone'), OUT_MS)
    return () => window.clearTimeout(id)
  }, [phase, reveal])

  if (phase === 'gone') return null
  return (
    <div className={`boot ${phase === 'out' ? 'out' : ''}`} role="status" aria-live="polite" aria-label="Loading RIFT">
      <div className="boot-inner">
        <div className="boot-brand"><Wordmark /></div>
        <p className="boot-tag">Fire drills for the buildings you actually use</p>
        <Drill />
        <div className="boot-bar" aria-hidden><i style={{ transform: `scaleX(${Math.max(0.06, all / total)})` }} /></div>
        <ul className="boot-tasks">
          {ROWS.map(r => (
            <li key={r.task} className={`${tasks[r.task]} ${r.task === 'nemotron' ? 'nv' : ''}`}>
              <span className="tick" aria-hidden />{r.label(tasks[r.task])}
            </li>
          ))}
        </ul>
      </div>
      <span className="boot-foot">tidalBYTE '26 · Texas A&amp;M · Powered by NVIDIA Nemotron</span>
    </div>
  )
}
