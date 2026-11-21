import type { ImportInfo } from '../state/store'
import type { Scenario } from '../sim/types'
import { buildImportedScenario, findContentBox, rasterToGrid, type Semantics } from './floorplan'
import { readPlanWithNemotron } from './vision'

export type Step = { label: string; state: 'run' | 'ok' | 'warn' }

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

export interface ImportOptions {
  /** semantics to use when Nemotron VL is unavailable (e.g. a plan we generated ourselves) */
  fallback?: Semantics
  /** twin title, overrides the vision model's */
  title?: string
  /** skip Nemotron VL, e.g. for a plan we drew ourselves and already know the layout of */
  vision?: boolean
}

export interface ImportResult { scenario: Scenario; info: ImportInfo; semantics: Semantics | null }

/** Floor-plan image → digital twin: CV wall tracing, Nemotron VL semantics, scenario build. Reports progress through `onSteps`. */
export async function importPlan(src: string, onSteps: (steps: Step[]) => void, opts: ImportOptions = {}): Promise<ImportResult> {
  const log: Step[] = []
  const push = (s: Step) => { log.push(s); onSteps([...log]) }
  const done = (state: Step['state'], label?: string) => { log[log.length - 1] = { label: label ?? log[log.length - 1].label, state }; onSteps([...log]) }

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

  let semantics: Semantics | null = null
  let provider: ImportInfo['provider'] = opts.fallback ? 'generated' : 'heuristic'
  const fallbackLabel = opts.fallback ? 'using the generated plan’s labels' : 'heuristic fallback'
  if (opts.vision !== false) try {
    push({ label: 'NVIDIA Nemotron VL reading rooms, exits, fire risk…', state: 'run' })
    const r = await readPlanWithNemotron(dataUrl)
    semantics = r.semantics
    if (semantics) { provider = 'nemotron-vl'; done('ok', `Nemotron VL · ${semantics.rooms.length} rooms, ${semantics.exits.length} exits (${(r.latencyMs / 1000).toFixed(1)}s)`) }
    else done('warn', `Nemotron VL returned no usable layout, ${fallbackLabel}`)
  } catch (e) {
    done('warn', `Vision unavailable (${e instanceof Error ? e.message : 'error'}), ${fallbackLabel}`)
  }
  semantics ??= opts.fallback ?? null
  if (semantics && opts.title) semantics = { ...semantics, title: opts.title }

  push({ label: 'Building digital twin…', state: 'run' })
  const { scenario, notes } = buildImportedScenario(grid, semantics, { exactExits: opts.vision === false && Boolean(opts.fallback) && semantics === opts.fallback })
  done('ok', `Twin ready · ${scenario.layout!.zones.reduce((a, z) => a + z.occupants, 0)} occupants simulated`)
  return { scenario, semantics, info: { imageUrl: dataUrl, notes: [...notes, ...(semantics?.notes ?? [])], provider } }
}
