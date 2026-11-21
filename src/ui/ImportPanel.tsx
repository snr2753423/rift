import { useRef, useState } from 'react'
import { buildImportedScenario, findContentBox, rasterToGrid, type Semantics } from '../import/floorplan'
import { readPlanWithNemotron } from '../import/vision'
import { useRift } from '../state/store'

type Step = { label: string; state: 'run' | 'ok' | 'warn' }

const MAX_PIXELS = 40_000_000

/** Load without forcing a full decode, then reject oversized images (decompression bombs) before drawing. */
async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('could not read image')); img.src = src })
  if ((img.naturalWidth || 1) * (img.naturalHeight || 1) > MAX_PIXELS) throw new Error('image is too large (over 40 megapixels)')
  return img
}

function rasterize(img: HTMLImageElement, maxW = 1280) {
  const scale = Math.min(1, maxW / (img.naturalWidth || maxW))
  const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale)), h = Math.max(1, Math.round((img.naturalHeight || maxW * 0.625) * scale))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h)
  g.drawImage(img, 0, 0, w, h)
  return { canvas: c, raster: { width: w, height: h, data: g.getImageData(0, 0, w, h).data } }
}

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
    const log: Step[] = []
    const push = (s: Step) => { log.push(s); setSteps([...log]) }
    const done = (state: Step['state'], label?: string) => { log[log.length - 1] = { label: label ?? log[log.length - 1].label, state }; setSteps([...log]) }
    try {
      push({ label: 'Extracting walls (pixel-threshold CV)…', state: 'run' })
      const img = await loadImage(src)
      const { canvas, raster } = rasterize(img)
      const box = findContentBox(raster)
      const grid = rasterToGrid(raster, box, 64, 40)
      const walls = grid.solid.reduce((a, b) => a + b, 0)
      done('ok', `Walls traced · ${walls} wall cells, true proportions ${grid.fit.w}×${grid.fit.h}`)
      const crop = document.createElement('canvas')
      const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1, k = Math.min(1, 1024 / bw)
      crop.width = Math.round(bw * k); crop.height = Math.round(bh * k)
      crop.getContext('2d')!.drawImage(canvas, box.x0, box.y0, bw, bh, 0, 0, crop.width, crop.height)
      const dataUrl = crop.toDataURL('image/jpeg', 0.85)
      push({ label: 'Nemotron VL reading rooms, exits, fire risk…', state: 'run' })
      let semantics: Semantics | null = null
      let provider: 'nemotron-vl' | 'heuristic' = 'heuristic'
      try {
        const r = await readPlanWithNemotron(dataUrl)
        semantics = r.semantics
        if (semantics) { provider = 'nemotron-vl'; done('ok', `Nemotron VL · ${semantics.rooms.length} rooms, ${semantics.exits.length} exits (${(r.latencyMs / 1000).toFixed(1)}s)`) }
        else done('warn', 'Nemotron VL returned no usable layout — heuristic fallback')
      } catch (e) {
        done('warn', `Vision unavailable (${e instanceof Error ? e.message : 'error'}) — heuristic fallback`)
      }
      setSem(semantics)
      push({ label: 'Building digital twin…', state: 'run' })
      const { scenario, notes } = buildImportedScenario(grid, semantics)
      loadCustom(scenario, { imageUrl: dataUrl, notes: [...notes, ...(semantics?.notes ?? [])], provider })
      done('ok', `Twin ready · ${scenario.layout!.zones.reduce((a, z) => a + z.occupants, 0)} occupants simulated`)
    } catch (e) {
      push({ label: `Import failed: ${e instanceof Error ? e.message : String(e)}`, state: 'warn' })
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
    <section>
      <h3>Reality input</h3>
      <div className="seg">
        <button disabled={busy} onClick={() => file.current?.click()}>Upload</button>
        <button disabled={busy} onClick={() => void run('/samples/clinic-plan.svg')}>Clinic</button>
        <button disabled={busy} onClick={() => void run('/samples/l-school-plan.svg')}>L-school</button>
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
      {active && info && <ul className="import-notes">{info.notes.map((n, i) => <li key={i}>{n}</li>)}<li>Approximate reconstruction — geometry from image pixels, semantics from {info.provider === 'nemotron-vl' ? 'Nemotron VL' : 'heuristics'}. Not a survey.</li></ul>}
    </section>
  )
}
