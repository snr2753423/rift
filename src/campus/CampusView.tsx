import { useEffect, useRef, useState } from 'react'
import { importPlan, type Step } from '../import/pipeline'
import { useRift } from '../state/store'
import { CampusMap } from './CampusMap'
import { loadCampus, type CampusData, type Spot } from './data'
import { generatePlan } from './plan'

const FADE_MS = 800

export function CampusView({ leaving }: { leaving: boolean }) {
  const [campus, setCampus] = useState<{ data: CampusData; spots: Spot[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<Spot | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const returnName = useRef(useRift.getState().building)
  const arrived = useRef<() => void>(() => {})
  const labels = useRef(new Map<string, HTMLElement>())

  useEffect(() => { loadCampus().then(setCampus, e => setError(e instanceof Error ? e.message : String(e))) }, [])

  async function pick(spot: Spot) {
    if (selected) return
    setSelected(spot)
    setHovered(null)
    setSteps([])
    const landed = new Promise<void>(res => { arrived.current = res })
    try {
      const plan = generatePlan({ footprint: spot.footprint, entrances: spot.entrances, rooms: spot.rooms })
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`
      const [r] = await Promise.all([importPlan(src, setSteps, { fallback: plan.semantics, title: spot.name }), landed])
      const source = `Footprint from OpenStreetMap; ${plan.mappedExits} of ${plan.exitCount} exits at mapped entrances. The interior layout is schematic, not the real floor plan.`
      const s = useRift.getState()
      s.loadCustom(r.scenario, { ...r.info, notes: [source, ...r.info.notes] })
      s.set({ building: spot.name, view: 'entering', enteredAt: performance.now() })
      window.setTimeout(() => useRift.getState().set({ view: 'twin' }), FADE_MS)
    } catch (e) {
      setSteps(st => [...st, { label: `Could not build the twin: ${e instanceof Error ? e.message : String(e)}`, state: 'warn' }])
    }
  }

  function openDemo() {
    const s = useRift.getState()
    s.setScenario('kitchen_fire')
    s.set({ building: null, view: 'twin', enteredAt: 0 })
  }

  const returnFrom = campus?.spots.find(s => s.name === returnName.current) ?? null
  return (
    <div className={`campus ${leaving ? 'leaving' : ''}`}>
      {campus && (
        <CampusMap data={campus.data} spots={campus.spots} selected={selected} returnFrom={returnFrom} hovered={hovered} labels={labels.current}
          onHover={setHovered} onPick={s => void pick(s)} onArrived={() => arrived.current()} />
      )}
      {campus && (
        <div className={`landmarks ${selected ? 'hide' : ''}`}>
          {campus.spots.map(s => (
            <button key={s.name} ref={el => { if (el) labels.current.set(s.name, el); else labels.current.delete(s.name) }} className={`landmark ${hovered === s.name ? 'on' : ''}`}
              onPointerEnter={() => setHovered(s.name)} onPointerLeave={() => setHovered(null)} onClick={() => void pick(s)}>
              {s.note && <i aria-hidden />}{s.short}
            </button>
          ))}
        </div>
      )}
      <header className={`campus-head ${selected ? 'hide' : ''}`}>
        <span className="wordmark">RIFT<span>.</span></span>
        <h1>Pick a building to test its evacuation</h1>
        <p>{campus ? 'Texas A&M University, College Station' : 'Loading the campus map…'}</p>
      </header>
      {campus && !selected && (
        <nav className="campus-list" aria-label="Buildings">
          {campus.spots.map(s => (
            <button key={s.name} className={hovered === s.name ? 'on' : ''} onPointerEnter={() => setHovered(s.name)} onPointerLeave={() => setHovered(null)} onClick={() => void pick(s)}>
              <b>{s.short}</b><span>{s.note ?? s.kind}</span>
            </button>
          ))}
          <button className="demo" onClick={openDemo}><b>Demo office</b><span>Built-in scenarios</span></button>
        </nav>
      )}
      {selected && (
        <div className="campus-status">
          <b>{selected.name}</b>
          <ol className="import-steps">
            {steps.length === 0 && <li className="run">Generating a floor plan from the footprint…</li>}
            {steps.map((s, i) => <li key={i} className={s.state}>{s.label}</li>)}
          </ol>
          {steps.some(s => s.label.startsWith('Could not')) && <button className="btn" onClick={() => setSelected(null)}>Back to campus</button>}
        </div>
      )}
      {error && <div className="campus-status"><b>Campus map unavailable</b><p>{error}</p><button className="btn" onClick={openDemo}>Open the demo office</button></div>}
      <span className="attribution">Map data © OpenStreetMap contributors</span>
    </div>
  )
}
