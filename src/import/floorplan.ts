import { CELL } from '../sim/layout'
import type { Cell, ExitDef, Ignition, LayoutDef, Scenario, ZoneDef } from '../sim/types'
import { VOID, segmentPlan, type GridResult } from './segment'

export { VOID, findContentBox, rasterToGrid, segmentPlan, type Box, type GridResult, type RasterImage } from './segment'

export interface Semantics {
  title: string
  rooms: { name: string; x: number; y: number; w: number; h: number; occupants?: number }[]
  exits: { name: string; x: number; y: number }[]
  fireRisk: { room: string; x: number; y: number; reason: string } | null
  notes: string[]
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

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Open a doorway through the envelope wall nearest (gx, gy) — used when the vision model sees an exit the drawing doesn't gap. */
function carveEnvelopeExit(solid: Uint8Array, W: number, H: number, gx: number, gy: number): Cell[] {
  let best = -1, bd = Infinity, dir: [number, number] = [0, 0]
  for (let i = 0; i < W * H; i++) {
    if (solid[i] !== 1) continue
    const x = i % W, y = (i / W) | 0
    for (const [dx, dy] of N4) {
      const ox = x + dx, oy = y + dy
      const outside = ox < 0 || oy < 0 || ox >= W || oy >= H || solid[oy * W + ox] === VOID
      if (!outside) continue
      // must lead to floor within 3 cells inward
      let reach = false
      for (let s = 1; s <= 3; s++) { const ix = x - dx * s, iy = y - dy * s; if (ix >= 0 && iy >= 0 && ix < W && iy < H && solid[iy * W + ix] === 0) { reach = true; break } }
      const d = Math.hypot(x - gx, y - gy)
      if (reach && d < bd) { bd = d; best = i; dir = [dx, dy] }
    }
  }
  if (best < 0) return []
  const [dx, dy] = dir, px = -dy, py = dx
  const cells: Cell[] = []
  for (let k = -1; k <= 1; k++) {
    const x = (best % W) + px * k, y = ((best / W) | 0) + py * k
    if (x < 0 || y < 0 || x >= W || y >= H || solid[y * W + x] !== 1) continue
    solid[y * W + x] = 0
    cells.push([x, y])
    for (let s = 1; s <= 4; s++) { const i = (y - dy * s) * W + (x - dx * s); if (solid[i] !== 1) break; solid[i] = 0 }
  }
  return cells
}

/** Floor cells reachable from any exit (4-connected). */
function reachable(solid: Uint8Array, W: number, H: number, exits: ExitDef[]): Uint8Array {
  const seen = new Uint8Array(W * H)
  const stack: number[] = []
  for (const e of exits) for (const [x, y] of e.cells) { const i = y * W + x; if (!seen[i]) { seen[i] = 1; stack.push(i) } }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % W, y = (i / W) | 0
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (!seen[j] && solid[j] === 0) { seen[j] = 1; stack.push(j) }
    }
  }
  return seen
}

/** Shortest path from a sealed room through its wall to reachable floor; opens the wall cells on it. */
function openSealedRoom(solid: Uint8Array, W: number, H: number, room: Cell[], reach: Uint8Array, keepEnvelope = false): boolean {
  // keepEnvelope: never cut through a wall cell that touches the outside (that would open a gap that is not an exit)
  const onEnvelope = (j: number) => solid[j] === 1 && N4.some(([dx, dy]) => solid[j + dy * W + dx] === VOID)
  const prev = new Int32Array(W * H).fill(-2)
  const queue: number[] = []
  for (const [x, y] of room) { const i = y * W + x; prev[i] = -1; queue.push(i) }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    if (reach[i] && solid[i] === 0) {
      for (let c = i; c >= 0; c = prev[c]) if (solid[c] === 1) solid[c] = 0
      return true
    }
    const x = i % W, y = (i / W) | 0
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue
      const j = ny * W + nx
      if (prev[j] !== -2 || solid[j] === VOID || (keepEnvelope && onEnvelope(j))) continue
      prev[j] = i
      queue.push(j)
    }
  }
  return false
}

/** Connected walkable areas: component id per cell (-1 for walls/outside) and the largest component. */
function floorParts(solid: Uint8Array, W: number, H: number) {
  const of = new Int32Array(W * H).fill(-1)
  let count = 0, largest = -1, best = 0
  for (let s = 0; s < W * H; s++) {
    if (solid[s] !== 0 || of[s] >= 0) continue
    const stack = [s]; of[s] = count
    let size = 0
    while (stack.length) {
      const i = stack.pop()!; size++
      const x = i % W, y = (i / W) | 0
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = ny * W + nx
        if (solid[j] === 0 && of[j] < 0) { of[j] = count; stack.push(j) }
      }
    }
    if (size > best) { best = size; largest = count }
    count++
  }
  return { of, count, largest }
}

/** Every cell of the component that holds this zone (the zone plus whatever it is already joined to). */
function z2cells(parts: ReturnType<typeof floorParts>, z: ZoneDef, W: number): Cell[] {
  const id = z.cells!.map(([x, y]) => parts.of[y * W + x]).find(v => v >= 0 && v !== parts.largest)!
  const out: Cell[] = []
  for (let i = 0; i < parts.of.length; i++) if (parts.of[i] === id) out.push([i % W, (i / W) | 0])
  return out
}

const centre = (cells: Cell[]): [number, number] => [cells.reduce((a, c) => a + c[0], 0) / cells.length, cells.reduce((a, c) => a + c[1], 0) / cells.length]

/**
 * Build a simulation scenario that keeps the plan's exact shape: outside is void, every walled area is a room,
 * exits come from real gaps in the outer wall (named by the vision model when it sees them).
 */
export interface BuildOptions {
  /** the semantics list every exit exactly (a plan we drew ourselves): gaps that match none of them are drawing artefacts and get walled up */
  exactExits?: boolean
}

export function buildImportedScenario(grid: GridResult, sem: Semantics | null, opts: BuildOptions = {}): { scenario: Scenario; notes: string[] } {
  const { W, H, fit } = grid
  const seg = segmentPlan(grid.solid, W, H)
  const solid = Uint8Array.from(seg.cls)
  const notes: string[] = []
  const toGrid = (nx: number, ny: number): [number, number] => [fit.x + nx * fit.w, fit.y + ny * fit.h]

  // --- exits: real envelope openings first, named by the nearest exit the vision model reported
  const used = new Set<string>()
  const mkId = (name: string, i: number) => { let id = `EXIT_${slug(name)}`; if (used.has(id)) id = `${id}_${i + 1}`; used.add(id); return id }
  const semExits = (sem?.exits ?? []).map(e => ({ ...e, g: toGrid(e.x, e.y), matched: false }))
  const exits: ExitDef[] = []
  seg.openings.forEach((cells, i) => {
    const [cx, cy] = centre(cells)
    const m = semExits.filter(e => !e.matched).sort((a, b) => Math.hypot(a.g[0] - cx, a.g[1] - cy) - Math.hypot(b.g[0] - cx, b.g[1] - cy))[0]
    const near = m && Math.hypot(m.g[0] - cx, m.g[1] - cy) <= 8
    if (near) m.matched = true
    if (!near && opts.exactExits) { for (const [x, y] of cells) solid[y * W + x] = 1; return }
    const name = near ? m.name : `Exit ${i + 1}`
    exits.push({ id: mkId(name, i), name, cells, fireDoor: /fire|emerg/i.test(name) })
  })
  if (exits.length) notes.push(`${exits.length} exit${exits.length > 1 ? 's' : ''} found as gaps in the outer wall of the drawing.`)
  for (const e of semExits.filter(x => !x.matched)) {
    const cells = carveEnvelopeExit(solid, W, H, e.g[0], e.g[1])
    if (cells.length) { exits.push({ id: mkId(e.name, exits.length), name: e.name, cells, fireDoor: /fire|emerg/i.test(e.name) }); notes.push(`${e.name}: the vision model saw an exit where the drawing has no gap — a doorway was opened there.`) }
  }
  if (!exits.length) {
    for (const [nx, ny, name] of [[0, 0.5, 'West door'], [1, 0.5, 'East door']] as const) {
      const cells = carveEnvelopeExit(solid, W, H, toGrid(nx, ny)[0], toGrid(nx, ny)[1])
      if (cells.length) exits.push({ id: mkId(name, exits.length), name, cells, fireDoor: false })
    }
    notes.push('No exits found in the drawing or by the vision model — fallback doorways opened on the west and east walls.')
  }

  // --- rooms: one zone per walled area; if one area holds several named rooms (wide doorway), split it between them
  const semRooms = (sem?.rooms ?? []).map(r => ({ ...r, g: toGrid(r.x + r.w / 2, r.y + r.h / 2) }))
  const roomCells: { name: string | null; cells: Cell[]; occupants?: number }[] = []
  seg.rooms.forEach(cells => {
    const named = semRooms.filter(r => { const gx = Math.round(r.g[0]), gy = Math.round(r.g[1]); return cells.some(c => Math.abs(c[0] - gx) <= 1 && Math.abs(c[1] - gy) <= 1) })
    if (named.length <= 1) { roomCells.push({ name: named[0]?.name ?? null, cells, occupants: named[0]?.occupants }); return }
    const parts = named.map(r => ({ name: r.name, occupants: r.occupants, cells: [] as Cell[] }))
    for (const c of cells) {
      let k = 0, bd = Infinity
      named.forEach((r, j) => { const d = Math.hypot(c[0] - r.g[0], c[1] - r.g[1]); if (d < bd) { bd = d; k = j } })
      parts[k].cells.push(c)
    }
    roomCells.push(...parts.filter(p => p.cells.length))
  })
  let unnamed = 0
  const raw = roomCells.map((r, i) => {
    const xs = r.cells.map(c => c[0]), ys = r.cells.map(c => c[1])
    const rect: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    const long = Math.max(rect[2] - rect[0], rect[3] - rect[1]) + 1
    const corridor = r.cells.length / long <= 4.5 && long >= 12
    const name = r.name ?? (corridor ? 'Corridor' : `Room ${++unnamed}`)
    const est = (r.cells.length * CELL * CELL) / 2.5 // floor-area capacity at 2.5 m² per person
    const occ = corridor ? est * 0.25 : Math.max(r.occupants && r.occupants > 0 ? Math.min(r.occupants, est * 2) : est, est * 0.6)
    return { id: `Z${i + 1}_${slug(name)}`, name, rect, cells: r.cells, occupants: occ }
  })
  const total = raw.reduce((a, z) => a + z.occupants, 0)
  const k = total > 320 ? 320 / total : 1
  let zones: ZoneDef[] = raw.map(z => ({ ...z, occupants: Math.max(2, Math.round(z.occupants * k)) }))
  notes.push(`${zones.length} walled area${zones.length === 1 ? '' : 's'} found; occupancy modelled as a surge (≥60% of floor-area capacity).`)

  // --- a room the drawing seals completely gets a doorway to the nearest reachable space
  for (const z of zones) {
    const reach = reachable(solid, W, H, exits)
    if (z.cells!.some(([x, y]) => reach[y * W + x])) continue
    if (openSealedRoom(solid, W, H, z.cells!, reach)) notes.push(`${z.name} appears sealed in the drawing (no door) — a doorway was added so occupants can leave.`)
  }
  // --- our own generated plans: rooms that only reach their own exit (a door the drawing lost) join the rest of the floor.
  // Uploaded plans are left as drawn: a real building can have wings that do not connect.
  if (opts.exactExits) {
    const stuck = new Set<string>()
    for (let guard = 0; guard < zones.length; guard++) {
      const parts = floorParts(solid, W, H)
      const main = new Uint8Array(W * H)
      for (let i = 0; i < W * H; i++) if (parts.of[i] === parts.largest) main[i] = 1
      const cut = zones.find(z => !stuck.has(z.id) && z.cells!.some(([x, y]) => parts.of[y * W + x] >= 0 && parts.of[y * W + x] !== parts.largest))
      if (!cut) break
      const area = z2cells(parts, cut, W)
      if (openSealedRoom(solid, W, H, area, main, true) || openSealedRoom(solid, W, H, area, main)) notes.push(`${cut.name} was cut off from the rest of the floor in the drawing — a doorway was added to join it.`)
      else { stuck.add(cut.id); notes.push(`${cut.name} could not be joined to the rest of the floor.`) }
    }
  }
  // repairs moved walls: keep only walkable cells in each room
  for (const z of zones) z.cells = z.cells!.filter(([x, y]) => solid[y * W + x] === 0)
  zones = zones.filter(z => z.cells!.length > 0)
  const zoneMap = new Int16Array(W * H).fill(-1)
  zones.forEach((z, zi) => { for (const [x, y] of z.cells!) zoneMap[y * W + x] = zi })

  // --- fire: where the vision model expects ignition, else the middle of the largest room
  const ignitions: Ignition[] = []
  const fr = sem?.fireRisk ? { g: toGrid(sem.fireRisk.x, sem.fireRisk.y), room: sem.fireRisk.room, reason: sem.fireRisk.reason } : zones[0] ? { g: centre(zones[0].cells!), room: zones[0].name, reason: 'fallback: centre of the largest room' } : null
  if (fr) {
    let best: Cell | null = null, bd = Infinity
    for (let i = 0; i < W * H; i++) if (solid[i] === 0) { const x = i % W, y = (i / W) | 0, d = Math.hypot(x - fr.g[0], y - fr.g[1]); if (d < bd) { bd = d; best = [x, y] } }
    if (best) ignitions.push({ cell: best, t: 0 })
    notes.push(`Fire scenario seeded at ${fr.room}${fr.reason ? ` — ${fr.reason}` : ''}.`)
  }

  const title = sem?.title ?? 'Imported floor plan'
  const layout: LayoutDef = { id: `import-${Date.now()}`, name: title, width: W, height: H, solid, exits, zones, zoneMap, corridors: false, source: 'shape, walls, rooms and exits from the drawing (CV); names and fire risk by Nemotron VL' }
  return {
    notes,
    scenario: { id: layout.id, layout, name: `Imported · ${title}`, blurb: `${zones.length} rooms, ${exits.length} exits recognised from your floor plan.`, ignitions, blockedExits: [], occupancy: {}, fireSpreadPerSec: 0.05, smokeYield: 0.9, seed: 7, tMax: 240 },
  }
}
