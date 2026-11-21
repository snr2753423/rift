import { useRef, useState } from 'react'
import { loadCampus } from '../campus/data'
import { openFloor } from '../campus/open'
import { SCENARIOS, type ScenarioId } from '../sim/scenarios'
import { cancelAgent } from '../state/actions'
import { useRift } from '../state/store'
import { Icon } from './icons'
import { ImportPanel } from './ImportPanel'
import { useDismiss } from './useDismiss'
import { Wordmark } from './Wordmark'

function FloorPicker() {
  const { building, floor, floors, agentStatus } = useRift()
  const [busy, setBusy] = useState(false)
  if (!building) return null
  const go = async (f: number) => {
    if (f === floor || busy) return
    if (agentStatus === 'running') cancelAgent()
    setBusy(true)
    try {
      const spot = (await loadCampus()).spots.find(s => s.name === building)
      if (spot) await openFloor(spot, f)
    } finally { setBusy(false) }
  }
  return (
    <div className="floors" role="group" aria-label="Floor">
      <span>Floor</span>
      {Array.from({ length: floors }, (_, i) => i + 1).map(f => (
        <button key={f} className={f === floor ? 'on' : ''} disabled={busy} onClick={() => void go(f)}>{f}</button>
      ))}
    </div>
  )
}

export function TopBar() {
  const scenarioId = useRift(s => s.scenarioId)
  const building = useRift(s => s.building)
  const setScenario = useRift(s => s.setScenario)
  const provider = useRift(s => s.provider)
  const status = useRift(s => s.agentStatus)
  const [importOpen, setImportOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  useDismiss(anchor, importOpen, () => setImportOpen(false))
  const offline = provider === 'fallback'
  const toCampus = () => { if (status === 'running') cancelAgent(); useRift.getState().set({ view: 'campus' }) }
  return (
    <header className="topbar">
      <Wordmark onClick={toCampus} />
      <button className="btn" onClick={toCampus}><Icon name="map" />Campus</button>
      {building ? (
        <>
          <h1 className="place">{building}</h1>
          <FloorPicker />
        </>
      ) : (
        <select className="select" aria-label="Scenario" value={scenarioId} onChange={e => setScenario(e.target.value as ScenarioId)}>
          {(Object.keys(SCENARIOS) as ScenarioId[]).map(id => <option key={id} value={id}>{SCENARIOS[id].name}</option>)}
          {scenarioId === 'imported' && <option value="imported" disabled>Imported floor plan</option>}
        </select>
      )}
      <span className="spacer" />
      <div className="pop-anchor" ref={anchor}>
        <button className="btn ghost" aria-expanded={importOpen} onClick={() => setImportOpen(o => !o)}><Icon name="upload" />Your own floor plan</button>
        {/* stays mounted while hidden so an import in progress keeps its log */}
        <div className="popover down right" hidden={!importOpen}><ImportPanel /></div>
      </div>
      <span className={`nv-badge ${offline ? 'offline' : ''}`} title={offline ? 'No connection to NVIDIA right now; a labelled scripted planner is standing in' : 'Evacuation plans are planned and tested by NVIDIA Nemotron'}>
        <span className={`dot ${status === 'running' ? 'run' : offline ? 'warn' : 'live'}`} />{offline ? 'Offline fallback' : 'Powered by NVIDIA Nemotron'}
      </span>
    </header>
  )
}
