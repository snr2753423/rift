import { SCENARIOS, type ScenarioId } from '../sim/scenarios'
import { useRift, type Heatmap, type ToolMode } from '../state/store'
import { describeMod } from '../agent/tools'

const TOOLS: { id: ToolMode; label: string; hint: string; key: string }[] = [
  { id: 'orbit', label: 'Navigate', hint: 'Drag to orbit, scroll to zoom', key: 'V' },
  { id: 'fire', label: 'Ignite fire', hint: 'Click any floor cell', key: 'F' },
  { id: 'obstacle', label: 'Drop obstacle', hint: 'Corridors are blocked wall-to-wall', key: 'O' },
  { id: 'block', label: 'Block exit', hint: 'Click near an exit', key: 'B' },
]
const HEAT: Heatmap[] = ['off', 'danger', 'density', 'smoke']

export function LeftRail() {
  const s = useRift()
  return (
    <aside className="rail left">
      <section>
        <h3>Scenario</h3>
        <div className="scenarios">
          {(Object.keys(SCENARIOS) as ScenarioId[]).map(id => (
            <button key={id} className={`scenario ${s.scenarioId === id ? 'on' : ''}`} onClick={() => s.setScenario(id)}>
              <b>{SCENARIOS[id].name}</b>
              <span>{SCENARIOS[id].blurb}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Inject event</h3>
        <div className="tools">
          {TOOLS.map(t => (
            <button key={t.id} className={`tool ${s.tool === t.id ? 'on' : ''} t-${t.id}`} onClick={() => s.set({ tool: t.id })} title={t.hint}>
              <i />{t.label}<kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <p className="hint">{TOOLS.find(t => t.id === s.tool)?.hint}{s.decision && s.tool !== 'orbit' ? ' — the agent will replan automatically.' : ''}</p>
        {s.mods.length > 0 && (
          <ul className="mods">
            {s.mods.map((m, i) => <li key={i}>{describeMod(m)}</li>)}
            <li><button className="link" onClick={s.clearMods}>Clear injected events</button></li>
          </ul>
        )}
      </section>
      <section>
        <h3>Overlay</h3>
        <div className="seg">
          {HEAT.map(h => <button key={h} className={s.heatmap === h ? 'on' : ''} onClick={() => s.set({ heatmap: h })}>{h}</button>)}
        </div>
        <label className="check"><input type="checkbox" checked={s.showRoutes} onChange={e => s.set({ showRoutes: e.target.checked })} /> Evacuation routes</label>
      </section>
      <section>
        <h3>Camera</h3>
        <div className="seg">
          {(['iso', 'top', 'low'] as const).map(c => <button key={c} className={s.cameraPreset === c ? 'on' : ''} onClick={() => s.set({ cameraPreset: c })}>{c}</button>)}
        </div>
      </section>
      <section>
        <h3>Playback</h3>
        <div className="seg">
          <button onClick={() => s.set({ playing: !s.playing })}>{s.playing ? 'Pause' : 'Play'}</button>
          <button onClick={s.restart}>Restart</button>
        </div>
        <div className="seg">
          {[1, 3, 6].map(v => <button key={v} className={s.speed === v ? 'on' : ''} onClick={() => s.set({ speed: v })}>{v}×</button>)}
        </div>
      </section>
    </aside>
  )
}
