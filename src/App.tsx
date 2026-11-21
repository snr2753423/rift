import { useEffect } from 'react'
import { wireAutomation } from './state/actions'
import { startDriver } from './state/live'
import { scenarioOf, useRift, type ToolMode } from './state/store'
import { AgentPanel } from './ui/AgentPanel'
import { LeftRail } from './ui/LeftRail'
import { Results } from './ui/Results'
import { Stage } from './ui/Stage'

const KEYS: Record<string, ToolMode> = { v: 'orbit', f: 'fire', o: 'obstacle', b: 'block' }

export default function App() {
  useEffect(() => {
    startDriver()
    wireAutomation()
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const t = KEYS[e.key.toLowerCase()]
      if (t) useRift.getState().set({ tool: t })
      if (e.key === ' ') { e.preventDefault(); useRift.getState().set({ playing: !useRift.getState().playing }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const provider = useRift(s => s.provider)
  const twinName = useRift(s => scenarioOf(s).layout?.name ?? 'Level 1 Office')
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden><i /><i /><i /></span>
          <div>
            <h1>RIFT</h1>
            <span className="sub">Reality Intelligence &amp; Future Testing</span>
          </div>
        </div>
        <div className="crumbs mono">
          <span>DIGITAL TWIN · {twinName} · 32 × 20 m · 0.5 m grid</span>
        </div>
        <div className="status mono">
          <span className="live-dot" /> SIM ENGINE DETERMINISTIC
          <span className={`prov ${provider ?? ''}`}>{provider === 'fallback' ? 'AGENT: DEMO FALLBACK' : 'AGENT: NVIDIA NEMOTRON'}</span>
        </div>
      </header>
      <LeftRail />
      <Stage />
      <AgentPanel />
      <Results />
    </div>
  )
}
