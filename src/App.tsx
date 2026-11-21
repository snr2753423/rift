import { useEffect } from 'react'
import { wireAutomation } from './state/actions'
import { startDriver } from './state/live'
import { useRift, type ToolMode } from './state/store'
import { AgentPanel } from './ui/AgentPanel'
import { Results } from './ui/Results'
import { Stage } from './ui/Stage'
import { TopBar } from './ui/TopBar'

const KEYS: Record<string, ToolMode> = { v: 'orbit', f: 'fire', o: 'obstacle', b: 'block' }

export default function App() {
  useEffect(() => {
    startDriver()
    wireAutomation()
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      const t = KEYS[e.key.toLowerCase()]
      if (t) useRift.getState().set({ tool: t })
      if (e.key === ' ') { e.preventDefault(); useRift.getState().set({ playing: !useRift.getState().playing }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="app">
      <TopBar />
      <Stage />
      <AgentPanel />
      <Results />
    </div>
  )
}
