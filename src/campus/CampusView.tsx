import { useEffect, useRef, useState } from 'react'
import { useRift } from '../state/store'
import { CampusMap } from './CampusMap'
import { loadCampus, type CampusData, type Spot } from './data'
import { openFloor } from './open'
import { floorsFor } from './plan'
import { Wordmark } from '../ui/Wordmark'

const FADE_MS = 900

/**
 * The landing map. Picking a building is one continuous move: the camera dives toward the roof while the
 * twin is built and mounted underneath; part-way down the map dissolves and the twin's camera finishes the descent.
 */
export function CampusView() {
  const [campus, setCampus] = useState<{ data: CampusData; spots: Spot[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<Spot | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const returnName = useRef(useRift.getState().building)
  const crossed = useRef<() => void>(() => {})
  const labels = useRef(new Map<string, HTMLElement>())

  useEffect(() => { loadCampus().then(setCampus, e => setError(e instanceof Error ? e.message : String(e))) }, [])

  async function pick(spot: Spot) {
    if (selected) return
    setSelected(spot)
    setHovered(null)
    setFailed(null)
    const atCross = new Promise<void>(res => { crossed.current = res })
    try {
      await openFloor(spot, 1)
      useRift.getState().set({ view: 'entering', enteredAt: Infinity }) // mount the twin under the map; its camera waits overhead
      await atCross
      useRift.getState().set({ enteredAt: performance.now() })
      setFading(true)
      window.setTimeout(() => useRift.getState().set({ view: 'twin' }), FADE_MS)
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e))
      useRift.getState().set({ view: 'campus' })
    }
  }

  function openDemo() {
    const s = useRift.getState()
    s.setScenario('kitchen_fire')
    s.set({ building: null, floor: 1, floors: 1, view: 'twin', enteredAt: 0 })
  }

  const returnFrom = campus?.spots.find(s => s.name === returnName.current) ?? null
  const startSpot = campus?.spots[0] ?? null
  return (
    <div className={`campus ${fading ? 'leaving' : ''}`}>
      {campus && (
        <CampusMap data={campus.data} spots={campus.spots} selected={failed ? null : selected} returnFrom={returnFrom} hovered={hovered} labels={labels.current}
          onHover={setHovered} onPick={s => void pick(s)} onCross={() => crossed.current()} />
      )}
      {campus && (
        <div className={`landmarks ${selected ? 'hide' : ''}`}>
          {campus.spots.map(s => (
            <button key={s.name} ref={el => { if (el) labels.current.set(s.name, el); else labels.current.delete(s.name) }} className={`landmark ${hovered === s.name ? 'on' : ''} ${s.note ? 'here' : ''}`}
              onPointerEnter={() => setHovered(s.name)} onPointerLeave={() => setHovered(null)} onClick={() => void pick(s)}>
              {s.note && <i aria-hidden />}{s.short}
            </button>
          ))}
        </div>
      )}
      <header className={`campus-head ${selected ? 'hide' : ''}`}>
        <div className="brand-row"><Wordmark /><span className="nv-chip"><span className="nv-dot" />Powered by NVIDIA Nemotron</span></div>
        <h1>If the fire alarm went off right now, would you get out?</h1>
        <p>{campus ? 'RIFT turns a real Texas A&M building into a live fire drill with you inside it. In real fires, most people head for the way they came in, even when the fire is there. Watch it happen, then watch NVIDIA Nemotron rewrite the plan to save them.' : 'Loading Texas A&M…'}</p>
        {campus && (
          <>
            <ul className="impact-strip" aria-label="What RIFT shows">
              <li><b>39 → 0</b><span>people lost across 16 campus floors once the plan changes</span></li>
              <li><b>~1 min</b><span>for Nemotron to run up to 10 full evacuations and prove a safer plan</span></li>
              <li><b>{campus.spots.reduce((n, sp) => n + floorsFor(sp.height), 0)} floors</b><span>in {campus.spots.length} real buildings, built from OpenStreetMap</span></li>
            </ul>
            <ol className="how">
              <li><b>1</b><span><strong>Pick a building</strong>Your floor, your room</span></li>
              <li><b>2</b><span><strong>Live the drill</strong>Fire, smoke, crowds, you</span></li>
              <li className="nv"><b>3</b><span><strong>Nemotron plans</strong>Tested, not guessed</span></li>
            </ol>
            <div className="cta-row">
              {startSpot && <button className="btn primary start" onClick={() => void pick(startSpot)}>Start in the {startSpot.short}<span aria-hidden>→</span></button>}
              <span className="cta-alt">or pick any building on the map</span>
            </div>
            <p className="fine">Simulated with a deterministic crowd and smoke model. A tool for comparing plans, not a certified safety prediction.</p>
          </>
        )}
      </header>
      {campus && !selected && (
        <nav className="campus-list" aria-label="Buildings">
          <span className="list-title">Texas A&amp;M · College Station</span>
          {campus.spots.map(s => (
            <button key={s.name} className={hovered === s.name ? 'on' : ''} onPointerEnter={() => setHovered(s.name)} onPointerLeave={() => setHovered(null)} onClick={() => void pick(s)}>
              <b>{s.short}</b><span>{s.note ?? `${s.kind} · ${floorsFor(s.height)} fl`}</span>
            </button>
          ))}
          <button className="demo" onClick={openDemo}><b>Demo office</b><span>Built-in scenarios</span></button>
        </nav>
      )}
      {selected && !failed && (
        <div className="entering-caption" aria-live="polite">
          <span>Entering</span>
          <b>{selected.name}</b>
        </div>
      )}
      {failed && (
        <div className="campus-status">
          <b>Could not open {selected?.name}</b>
          <p>{failed}</p>
          <button className="btn" onClick={() => { setSelected(null); setFailed(null) }}>Back to campus</button>
        </div>
      )}
      {error && <div className="campus-status"><b>Campus map unavailable</b><p>{error}</p><button className="btn" onClick={openDemo}>Open the demo office</button></div>}
      <span className="attribution">Map data © OpenStreetMap contributors</span>
    </div>
  )
}
