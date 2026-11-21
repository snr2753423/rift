import { useRef, useState } from 'react'
import { SCENARIOS, type ScenarioId } from '../sim/scenarios'
import { useRift } from '../state/store'
import { Icon } from './icons'
import { ImportPanel } from './ImportPanel'
import { useDismiss } from './useDismiss'

export function TopBar() {
  const scenarioId = useRift(s => s.scenarioId)
  const setScenario = useRift(s => s.setScenario)
  const provider = useRift(s => s.provider)
  const status = useRift(s => s.agentStatus)
  const [importOpen, setImportOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  useDismiss(anchor, importOpen, () => setImportOpen(false))
  const dot = status === 'running' ? 'run' : provider === 'fallback' ? 'warn' : provider === 'nemotron' ? 'live' : ''
  const label = status === 'running' ? 'Agent running' : provider === 'fallback' ? 'Scripted fallback' : provider === 'nemotron' ? 'Nemotron live' : 'Agent idle'
  return (
    <header className="topbar">
      <span className="wordmark">RIFT<span>.</span></span>
      <select className="select" aria-label="Scenario" value={scenarioId} onChange={e => setScenario(e.target.value as ScenarioId)}>
        {(Object.keys(SCENARIOS) as ScenarioId[]).map(id => <option key={id} value={id}>{SCENARIOS[id].name}</option>)}
        {scenarioId === 'imported' && <option value="imported" disabled>Imported floor plan</option>}
      </select>
      <div className="pop-anchor" ref={anchor}>
        <button className="btn" aria-expanded={importOpen} onClick={() => setImportOpen(o => !o)}><Icon name="upload" />Import floor plan</button>
        {/* stays mounted while hidden so an import in progress keeps its log */}
        <div className="popover down" hidden={!importOpen}><ImportPanel /></div>
      </div>
      <span className="spacer" />
      <span className="provider"><span className={`dot ${dot}`} />{label}</span>
    </header>
  )
}
