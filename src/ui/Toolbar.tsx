import { useRef, useState } from 'react'
import { useRift, type Heatmap, type ToolMode } from '../state/store'
import { Icon, type IconName } from './icons'
import { useDismiss } from './useDismiss'

const TOOLS: { id: ToolMode; label: string; hint: string; key: string; icon: IconName }[] = [
  { id: 'orbit', label: 'Navigate', hint: 'Drag to orbit, scroll to zoom', key: 'V', icon: 'pointer' },
  { id: 'fire', label: 'Ignite fire', hint: 'Click the floor to start a fire', key: 'F', icon: 'fire' },
  { id: 'obstacle', label: 'Drop obstacle', hint: 'Click a corridor to block it', key: 'O', icon: 'obstacle' },
  { id: 'block', label: 'Block exit', hint: 'Click near an exit to close it', key: 'B', icon: 'block' },
]
const HEAT: Heatmap[] = ['off', 'danger', 'density', 'smoke']
const SPEEDS = [1, 3, 6]

function ViewMenu() {
  const s = useRift()
  return (
    <div className="popover up">
      <label className="field"><span>Overlay</span>
        <div className="seg">{HEAT.map(h => <button key={h} className={s.heatmap === h ? 'on' : ''} onClick={() => s.set({ heatmap: h })}>{h}</button>)}</div>
      </label>
      <label className="field"><span>Camera</span>
        <div className="seg">{(['iso', 'top', 'low'] as const).map(c => <button key={c} className={s.cameraPreset === c ? 'on' : ''} onClick={() => s.set({ cameraPreset: c })}>{c}</button>)}</div>
      </label>
      <label className="check"><input type="checkbox" checked={s.showRoutes} onChange={e => s.set({ showRoutes: e.target.checked })} /> Show evacuation routes</label>
    </div>
  )
}

export function Toolbar() {
  const s = useRift()
  const [viewOpen, setViewOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  useDismiss(anchor, viewOpen, () => setViewOpen(false))
  const active = TOOLS.find(t => t.id === s.tool)!
  return (
    <div className="toolbar-wrap">
      {s.tool !== 'orbit' && <div className="tool-hint">{active.hint}{s.decision ? ', the agent replans automatically' : ''}</div>}
      {s.tool === 'orbit' && s.mods.length > 0 && (
        <div className="tool-hint">{s.mods.length} event{s.mods.length > 1 ? 's' : ''} injected<button onClick={s.clearMods}>Clear</button></div>
      )}
      <div className="toolbar" role="toolbar" aria-label="Twin controls">
        {TOOLS.map(t => (
          <button key={t.id} className={`tb t-${t.id} ${s.tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={s.tool === t.id} onClick={() => s.set({ tool: t.id })}>
            <Icon name={t.icon} />
          </button>
        ))}
        <span className="tb-sep" />
        <button className="tb" title={s.playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={s.playing ? 'Pause' : 'Play'} onClick={() => s.set({ playing: !s.playing })}><Icon name={s.playing ? 'pause' : 'play'} /></button>
        <button className="tb" title="Restart" aria-label="Restart" onClick={s.restart}><Icon name="restart" /></button>
        <button className="tb text" title="Playback speed" onClick={() => s.set({ speed: SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length] })}>{s.speed}×</button>
        <span className="tb-sep" />
        <div className="pop-anchor" ref={anchor}>
          <button className={`tb ${viewOpen ? 'on' : ''}`} title="View options" aria-label="View options" aria-expanded={viewOpen} onClick={() => setViewOpen(o => !o)}><Icon name="layers" /></button>
          {viewOpen && <ViewMenu />}
        </div>
      </div>
    </div>
  )
}
