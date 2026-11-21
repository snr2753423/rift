import { CELL } from '../sim/layout'
import type { Cell, ExitDef, Ignition, LayoutDef, Scenario, ZoneDef } from '../sim/types'

export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Semantics {
  title: string
  rooms: { name: string; x: number; y: number; w: number; h: number; occupants?: number }[]
  exits: { name: string; x: number; y: number }[]
  fireRisk: { room: string; x: number; y: number; reason: string } | null
  notes: string[]
}

const DARK = 110 // luminance below this counts as ink (walls)
const lum = (d: Uint8ClampedArray, i: number) => (d[i + 3] < 40 ? 255 : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])

/** Bounding box of the drawing's ink, so the building envelope fills the simulation grid. */
export function findContentBox(img: RasterImage): Box {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (lum(img.data, (y * img.width + x) * 4) < DARK) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: img.width - 1, y1: img.height - 1 }
  return { x0, y0, x1, y1 }
}

/** Pixel-threshold wall extraction: a cell is wall if ≥12% of its pixels are ink. Returns solid grid (1 = wall). */
export function rasterToGrid(img: RasterImage, box: Box, W: number, H: number, frac = 0.12): Uint8Array {
  const solid = new Uint8Array(W * H)
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const px0 = box.x0 + Math.floor((gx / W) * bw), px1 = box.x0 + Math.max(Math.floor(((gx + 1) / W) * bw), Math.floor((gx / W) * bw) + 1)
    const py0 = box.y0 + Math.floor((gy / H) * bh), py1 = box.y0 + Math.max(Math.floor(((gy + 1) / H) * bh), Math.floor((gy / H) * bh) + 1)
    let ink = 0, total = 0
    for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) { total++; if (lum(img.data, (y * img.width + x) * 4) < DARK) ink++ }
    if (total && ink / total >= frac) solid[gy * W + gx] = 1
  }
  return solid
}

const num01 = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
/** model-provided labels are untrusted: plain characters only, short (they reach the planner prompt) */
const str = (v: unknown, d: string) => {
  const t = typeof v === 'string' ? v.replace(/[^A-Za-z0-9 .,()'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) : ''
  return t || d
}

/** Validate the vision model's JSON (untrusted). Returns null when nothing usable is present. */
export function parseSemantics(text: string): Semantics | null {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try { raw = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  const rooms = (Array.isArray(raw.rooms) ? raw.rooms : []).filter((r: Record<string, unknown>) => r && num01(r.x) && num01(r.y) && num01(r.w) && num01(r.h))
    .slice(0, 12).map((r: Record<string, unknown>, i: number) => ({ name: str(r.name, `Room ${i + 1}`), x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number, occupants: typeof r.occupants === 'number' ? r.occupants : undefined }))
  const exits = (Array.isArray(raw.exits) ? raw.exits : []).filter((e: Record<string, unknown>) => e && num01(e.x) && num01(e.y))
    .slice(0, 8).map((e: Record<string, unknown>, i: number) => ({ name: str(e.name, `Exit ${i + 1}`), x: e.x as number, y: e.y as number }))
  const fr = raw.fire_risk as Record<string, unknown> | undefined
  const fireRisk = fr && num01(fr.x) && num01(fr.y) ? { room: str(fr.room, 'unknown'), x: fr.x as number, y: fr.y as number, reason: str(fr.reason, '') } : null
  if (!rooms.length && !exits.length) return null
  return { title: str(raw.title, 'Imported floor plan'), rooms, exits, fireRisk, notes: (Array.isArray(raw.notes) ? raw.notes : []).map(n => String(n).replace(/[^\x20-\x7E]/g, '').slice(0, 160)).slice(0, 4) }
}

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 14) || 'X'

/** Carve an exit of `width` cells on the nearest outer edge and tunnel inward to open floor. */
function carveExit(solid: Uint8Array, W: number, H: number, nx: number, ny: number, width = 4): Cell[] {
  const gx = Math.round(nx * (W - 1)), gy = Math.round(ny * (H - 1))
  const d = [gx, W - 1 - gx, gy, H - 1 - gy]
  const side = d.indexOf(Math.min(...d))
  const cells: Cell[] = []
  const along = side < 2 ? Math.min(H - 2 - width, Math.max(1, gy - (width >> 1))) : Math.min(W - 2 - width, Math.max(1, gx - (width >> 1)))
  for (let k = 0; k < width; k++) {
    const a = along + k
    const [ex, ey, dx, dy] = side === 0 ? [0, a, 1, 0] : side === 1 ? [W - 1, a, -1, 0] : side === 2 ? [a, 0, 0, 1] : [a, H - 1, 0, -1]
    cells.push([ex, ey])
    for (let s = 1; s <= 6; s++) { // tunnel through the envelope wall
      const i = (ey + dy * s) * W + (ex + dx * s)
      if (solid[i] === 0) break
      solid[i] = 0
    }
  }
  return cells
}

export function buildImportedScenario(grid: Uint8Array, sem: Semantics | null, W = 64, H = 40): { scenario: Scenario; notes: string[] } {
  const solid = Uint8Array.from(grid)
  for (let x = 0; x < W; x++) { solid[x] = 1; solid[(H - 1) * W + x] = 1 }
  for (let y = 0; y < H; y++) { solid[y * W] = 1; solid[y * W + W - 1] = 1 }
  const notes: string[] = []
  const exitSrc = sem?.exits.length ? sem.exits : [{ name: 'West door', x: 0, y: 0.5 }, { name: 'East door', x: 1, y: 0.5 }, { name: 'North door', x: 0.5, y: 0 }]
  if (!sem?.exits.length) notes.push('No exits recognised — fallback: doors placed at west, east and north edges.')
  const used = new Set<string>()
  const exits: ExitDef[] = exitSrc.map((e, i) => {
    let id = `EXIT_${slug(e.name)}`
    if (used.has(id)) id = `${id}_${i + 1}`
    used.add(id)
    return { id, name: e.name, cells: carveExit(solid, W, H, e.x, e.y), fireDoor: /fire|emerg/i.test(e.name) }
  })
  const roomSrc = sem?.rooms.length ? sem.rooms : [0, 1, 2, 3, 4, 5].map(i => ({ name: `Sector ${'ABCDEF'[i]}`, x: (i % 3) / 3 + 0.02, y: Math.floor(i / 3) / 2 + 0.04, w: 0.29, h: 0.42, occupants: undefined as number | undefined }))
  if (!sem?.rooms.length) notes.push('No rooms recognised — fallback: floor split into six sectors.')
  let budget = 320
  const zones: ZoneDef[] = []
  roomSrc.forEach((r, i) => {
    const x0 = Math.max(1, Math.floor(r.x * W)), y0 = Math.max(1, Math.floor(r.y * H))
    const x1 = Math.min(W - 2, Math.ceil((r.x + r.w) * W) - 1), y1 = Math.min(H - 2, Math.ceil((r.y + r.h) * H) - 1)
    if (x1 <= x0 || y1 <= y0) return
    let open = 0
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!solid[y * W + x]) open++
    if (!open) return
    const est = Math.round((open * CELL * CELL) / 2.5) // ~2.5 m² per occupant
    // surge scenario: at least 60% of floor-area capacity, even if the model's typical headcount is lower
    const occ = Math.max(2, Math.min(budget, Math.round(Math.max(r.occupants && r.occupants > 0 ? Math.min(r.occupants, est * 2) : est, est * 0.6))))
    budget -= occ
    if (occ > 0) zones.push({ id: `Z${i + 1}_${slug(r.name)}`, name: r.name, rect: [x0, y0, x1, y1], occupants: occ })
  })
  notes.push('Occupancy modelled as a surge: at least 60% of each room\'s floor-area capacity (2.5 m² per person).')
  const ignitions: Ignition[] = []
  const fr = sem?.fireRisk ?? (zones[0] ? { x: (zones[0].rect[0] + zones[0].rect[2]) / 2 / W, y: (zones[0].rect[1] + zones[0].rect[3]) / 2 / H, room: zones[0].name, reason: 'fallback: centre of first room' } : null)
  if (fr) {
    const cx = Math.round(fr.x * (W - 1)), cy = Math.round(fr.y * (H - 1))
    let best: Cell | null = null, bd = Infinity
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!solid[y * W + x]) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = [x, y] } }
    if (best) ignitions.push({ cell: best, t: 0 })
    notes.push(`Fire scenario seeded at ${fr.room}${fr.reason ? ` — ${fr.reason}` : ''}.`)
  }
  const title = sem?.title ?? 'Imported floor plan'
  const layout: LayoutDef = { id: `import-${Date.now()}`, name: title, width: W, height: H, solid, exits, zones, corridors: false, source: 'walls by pixel-threshold CV; rooms/exits by Nemotron VL' }
  return {
    notes,
    scenario: { id: layout.id, layout, name: `Imported · ${title}`, blurb: `${zones.length} rooms, ${exits.length} exits recognised from your floor plan.`, ignitions, blockedExits: [], occupancy: {}, fireSpreadPerSec: 0.05, smokeYield: 0.9, seed: 7, tMax: 240 },
  }
}
