import { useRef, useState } from 'react'
import type { Semantics } from '../import/floorplan'
import { importPlan, type Step } from '../import/pipeline'
import { useRift } from '../state/store'

const SOURCE = { 'nemotron-vl': 'Nemotron VL', heuristic: 'heuristics', generated: 'the generated plan' } as const

export function ImportPanel() {
  const loadCustom = useRift(s => s.loadCustom)
  const info = useRift(s => s.importInfo)
  const active = useRift(s => s.scenarioId === 'imported')
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const [sem, setSem] = useState<Semantics | null>(null)
  const file = useRef<HTMLInputElement>(null)

  async function run(src: string) {
    setBusy(true)
    setSem(null)
    try {
      const r = await importPlan(src, setSteps)
      setSem(r.semantics)
      loadCustom(r.scenario, r.info)
    } catch (e) {
      setSteps(s => [...s, { label: `Import failed: ${e instanceof Error ? e.message : String(e)}`, state: 'warn' }])
    } finally {
      setBusy(false)
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/') || f.size > 8_000_000) { setSteps([{ label: 'Please choose an image under 8 MB (PNG, JPG, SVG).', state: 'warn' }]); return }
    const url = URL.createObjectURL(f)
    void run(url).finally(() => URL.revokeObjectURL(url))
  }

  return (
    <div>
      <h4>Import a floor plan</h4>
      <p>Walls are traced from the image. Nemotron VL names the rooms, exits and likeliest fire source.</p>
      <div className="import-actions">
        <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Upload</button>
        <button className="btn" disabled={busy} onClick={() => void run('/samples/clinic-plan.svg')}>Clinic</button>
        <button className="btn" disabled={busy} onClick={() => void run('/samples/l-school-plan.svg')}>School</button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={onFile} />
      {steps.length > 0 && (busy || active) && (
        <ol className="import-steps">
          {steps.map((s, i) => <li key={i} className={s.state}>{s.label}</li>)}
        </ol>
      )}
      {active && info && (
        <div className="plan-thumb">
          <img src={info.imageUrl} alt="Imported floor plan" />
          {sem?.rooms.map((r, i) => <span key={i} className="room" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}><em>{r.name}</em></span>)}
          {sem?.exits.map((e, i) => <span key={`e${i}`} className="exit" style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }} title={e.name} />)}
          {sem?.fireRisk && <span className="risk" style={{ left: `${sem.fireRisk.x * 100}%`, top: `${sem.fireRisk.y * 100}%` }} title={sem.fireRisk.reason} />}
        </div>
      )}
      {active && info && <ul className="import-notes">{info.notes.map((n, i) => <li key={i}>{n}</li>)}<li>Approximate reconstruction: geometry from image pixels, semantics from {SOURCE[info.provider]}. Not a survey.</li></ul>}
    </div>
  )
}
