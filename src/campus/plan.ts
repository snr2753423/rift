import type { Semantics } from '../import/floorplan'

export type Pt = [number, number]

/** Pairs [x0, z0, x1, z1, ...] → points, without a repeated closing point. */
export function toPoints(flat: number[]): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
  const [a, b] = [pts[0], pts[pts.length - 1]]
  if (pts.length > 1 && a[0] === b[0] && a[1] === b[1]) pts.pop()
  return pts
}

const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]

function bbox(pts: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

/**
 * Angle θ of the footprint's long axis (radians, in the x/z plane): rotating the footprint by −θ
 * lines it up with +x using the tightest edge-aligned bounding box.
 */
export function principalAngle(pts: Pt[]): number {
  let best = 0, bestArea = Infinity
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
    if (Math.hypot(bx - ax, by - ay) < 1) continue
    const a = Math.atan2(by - ay, bx - ax)
    const b = bbox(pts.map(p => rot(p, -a)))
    if (b.w * b.h < bestArea - 1e-6) { bestArea = b.w * b.h; best = b.w >= b.h ? a : a + Math.PI / 2 }
  }
  // keep θ in (−π/2, π/2] so the plan is never drawn upside down relative to north
  while (best > Math.PI / 2) best -= Math.PI
  while (best <= -Math.PI / 2) best += Math.PI
  return best
}

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Inside intervals of the horizontal (axis 0) or vertical (axis 1) line at `c`. */
export function clipLine(poly: Pt[], axis: 0 | 1, c: number): [number, number][] {
  const hits: number[] = []
  const o = axis === 0 ? 1 : 0 // coordinate held constant
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    if ((p[o] > c) !== (q[o] > c)) hits.push(p[axis] + ((c - p[o]) / (q[o] - p[o])) * (q[axis] - p[axis]))
  }
  hits.sort((a, b) => a - b)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]])
  return out
}

/** Remove the given open ranges from a list of intervals. */
function subtract(iv: [number, number][], cuts: [number, number][]): [number, number][] {
  let cur = iv
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = []
    for (const [a, b] of cur) {
      if (c1 <= a || c0 >= b) { next.push([a, b]); continue }
      if (c0 > a) next.push([a, c0])
      if (c1 < b) next.push([c1, b])
    }
    cur = next
  }
  return cur.filter(([a, b]) => b - a > 0.5)
}

export interface PlanInput {
  footprint: number[]
  entrances?: Pt[]
  rooms: string[]
  /** 1 = ground floor (exits at the street doors); upper floors exit by stairwells */
  floor?: number
}

/** Floors to offer for a building of this height (OpenStreetMap height or levels × 3.6 m). */
export const floorsFor = (height: number) => Math.max(1, Math.min(6, Math.round(height / 3.6)))

const ROOM_STEP = [0, 1.5, -1, 2, -1.5, 0.5] // room width varies by floor so each floor has its own layout

export interface GeneratedPlan {
  svg: string
  /** footprint long-axis angle; the twin is drawn rotated by −angle */
  angle: number
  semantics: Semantics
  /** wall segments in drawing pixels, and their stroke width */
  walls: [Pt, Pt][]
  wallWidth: number
  exitCount: number
  /** how many exits came from mapped OpenStreetMap entrances */
  mappedExits: number
}

const VIEW_W = 1280, VIEW_H = 800, MARGIN = 40
// the importer fits the drawing into a 62×38-cell area; sizes below are in those cells
const FIT_W = 62, FIT_H = 38

/**
 * Draw a sim-ready floor plan from a real building footprint: black walls on white, exits as gaps in the
 * outer wall at the mapped entrances, and a schematic interior (corridor spine, rooms with doors).
 */
export function generatePlan({ footprint, entrances = [], rooms: roomList, floor = 1 }: PlanInput): GeneratedPlan {
  const shift = ((floor - 1) * 2) % roomList.length
  const rooms = [...roomList.slice(shift), ...roomList.slice(0, shift)]
  const raw = toPoints(footprint)
  const angle = principalAngle(raw)
  const r0 = raw.map(p => rot(p, -angle))
  const b0 = bbox(r0)
  const s = Math.min((VIEW_W - 2 * MARGIN) / b0.w, (VIEW_H - 2 * MARGIN) / b0.h)
  const toPx = (p: Pt): Pt => { const [x, y] = rot(p, -angle); return [MARGIN + (x - b0.x0) * s, MARGIN + (y - b0.y0) * s] }
  const poly = raw.map(toPx)
  const B = bbox(poly)
  const cell = Math.max(B.w / FIT_W, B.h / FIT_H) // pixels per simulation cell
  // walls are drawn with square caps, which eat wall/2 into each side of every gap: cut gaps that much wider
  const wall = Math.max(6, cell * 0.6), exitGap = cell * 3.4 + wall, doorGap = cell * 2.6 + wall, half = cell * 2.2, roomW = cell * (9 + ROOM_STEP[(floor - 1) % ROOM_STEP.length])

  // --- exits: mapped entrances first, then midpoints of the longest walls, spread apart
  const edges = poly.map((p, i) => ({ p, q: poly[(i + 1) % poly.length], len: Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]) }))
  const snap = (pt: Pt) => snapPx(toPx(pt))
  const snapPx = (pt: Pt) => {
    let best = { i: 0, t: 0, d: Infinity }
    edges.forEach((e, i) => {
      if (e.len < 1e-6) return
      const t = Math.max(0, Math.min(1, ((pt[0] - e.p[0]) * (e.q[0] - e.p[0]) + (pt[1] - e.p[1]) * (e.q[1] - e.p[1])) / (e.len * e.len)))
      const d = Math.hypot(e.p[0] + t * (e.q[0] - e.p[0]) - pt[0], e.p[1] + t * (e.q[1] - e.p[1]) - pt[1])
      if (d < best.d) best = { i, t, d }
    })
    return best
  }
  const exits: { i: number; t: number; pt: Pt; mapped: boolean }[] = []
  const farFromExits = (pt: Pt) => exits.every(e => Math.hypot(e.pt[0] - pt[0], e.pt[1] - pt[1]) > cell * 8)
  const usable = (e: typeof edges[number]) => e.len >= exitGap * 1.3
  const stairs = floor > 1
  // upper floors: stairwells at both ends of the corridor, and mid-building on long floors
  const stairSpots: Pt[] = stairs ? [[B.x0, (B.y0 + B.y1) / 2], [B.x1, (B.y0 + B.y1) / 2], ...(B.w > B.h * 2.2 ? [[(B.x0 + B.x1) / 2, B.y0] as Pt] : [])] : []
  for (const sp of stairSpots) {
    const sn = snapPx(sp)
    const e = edges[sn.i]
    if (!usable(e)) continue
    const t = Math.max(exitGap / 2 / e.len, Math.min(1 - exitGap / 2 / e.len, sn.t))
    const pt: Pt = [e.p[0] + t * (e.q[0] - e.p[0]), e.p[1] + t * (e.q[1] - e.p[1])]
    if (farFromExits(pt)) exits.push({ i: sn.i, t, pt, mapped: false })
  }
  for (const ent of stairs ? [] : entrances) {
    const sn = snap(ent)
    const e = edges[sn.i]
    if (sn.d > cell * 3 || !usable(e)) continue
    const t = Math.max(exitGap / 2 / e.len, Math.min(1 - exitGap / 2 / e.len, sn.t))
    const pt: Pt = [e.p[0] + t * (e.q[0] - e.p[0]), e.p[1] + t * (e.q[1] - e.p[1])]
    if (exits.length < 5 && farFromExits(pt)) exits.push({ i: sn.i, t, pt, mapped: true })
  }
  for (const idx of edges.map((_, i) => i).sort((a, b) => edges[b].len - edges[a].len)) {
    if (exits.length >= 3) break
    const e = edges[idx]
    const pt: Pt = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2]
    if (usable(e) && farFromExits(pt)) exits.push({ i: idx, t: 0.5, pt, mapped: false })
  }

  const lines: [Pt, Pt][] = []
  // outer wall with exit gaps
  edges.forEach((e, i) => {
    const cuts = exits.filter(x => x.i === i).map(x => [x.t * e.len - exitGap / 2, x.t * e.len + exitGap / 2] as [number, number])
    for (const [a, b] of subtract([[0, e.len]], cuts)) {
      const at = (d: number): Pt => [e.p[0] + (d / e.len) * (e.q[0] - e.p[0]), e.p[1] + (d / e.len) * (e.q[1] - e.p[1])]
      lines.push([at(a), at(b)])
    }
  })

  // --- interior: a corridor along the long axis, a cross corridor for squat buildings, rooms off them
  const yc = (B.y0 + B.y1) / 2, xc = (B.x0 + B.x1) / 2
  const cross = B.w / B.h < 1.45
  const hBand: [number, number] = [yc - half, yc + half], vBand: [number, number] = [xc - half, xc + half]
  const xs: number[] = []
  const n = Math.max(2, Math.round(B.w / roomW))
  for (let k = 1; k < n; k++) { const x = B.x0 + (k * B.w) / n; if (!cross || Math.abs(x - xc) > half + cell * 2) xs.push(x) }
  const stops = [B.x0, ...xs, ...(cross ? vBand : []), B.x1].sort((a, b) => a - b)
  const roomSpans: [number, number][] = []
  for (let k = 0; k + 1 < stops.length; k++) if (!(cross && stops[k] === vBand[0])) roomSpans.push([stops[k], stops[k + 1]])

  // corridor walls, a door into every room along them
  // a door goes in the middle of the stretch of wall the room actually has (angled ends can clip it short)
  const doorIn = (wallRuns: [number, number][], [a, b]: [number, number]): [number, number][] => {
    const runs = wallRuns.map(([p, q]) => [Math.max(p, a), Math.min(q, b)] as [number, number]).filter(([p, q]) => q - p >= doorGap + cell)
    const [p, q] = runs.sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]))[0] ?? [0, 0]
    return q > p ? [[(p + q) / 2 - doorGap / 2, (p + q) / 2 + doorGap / 2]] : []
  }
  for (const y of hBand) {
    const runs = subtract(clipLine(poly, 0, y), cross ? [vBand] : [])
    const doors = roomSpans.flatMap(span => doorIn(runs, span))
    for (const [a, b] of subtract(clipLine(poly, 0, y), [...doors, ...(cross ? [vBand] : [])])) lines.push([[a, y], [b, y]])
  }
  if (cross) for (const x of vBand) {
    const doors = [B.y0 + (hBand[0] - B.y0) / 2, hBand[1] + (B.y1 - hBand[1]) / 2].map(m => [m - doorGap / 2, m + doorGap / 2] as [number, number])
    for (const [a, b] of subtract(clipLine(poly, 1, x), [...doors, hBand])) lines.push([[x, a], [x, b]])
  }
  // room partitions, perpendicular to the corridor
  for (const x of xs) for (const [a, b] of subtract(clipLine(poly, 1, x), [hBand])) lines.push([[x, a], [x, b]])

  // --- labels + semantics (fractions of the drawing's bounding box, like the vision model returns)
  const fx = (x: number) => (x - B.x0) / B.w, fy = (y: number) => (y - B.y0) / B.h
  const labels: { x: number; y: number; text: string }[] = []
  const semRooms: Semantics['rooms'] = []
  let r = 0
  for (const [a, b] of roomSpans) for (const [y0, y1] of [[B.y0, hBand[0]], [hBand[1], B.y1]] as const) {
    const cx = (a + b) / 2, cy = (y0 + y1) / 2
    if (!pointInPolygon([cx, cy], poly) || semRooms.length >= 11) continue
    const name = rooms[r % rooms.length] + (r >= rooms.length ? ` ${Math.floor(r / rooms.length) + 1}` : '')
    r++
    labels.push({ x: cx, y: cy, text: name })
    semRooms.push({ name, x: fx(a), y: fy(y0), w: (b - a) / B.w, h: (y1 - y0) / B.h })
  }
  labels.push({ x: cross ? B.x0 + B.w / 4 : xc, y: yc + cell * 0.4, text: 'Corridor' })
  const exitNames = exits.map((e, i) => (stairs ? `Stair ${'ABCDE'[i]}` : i === 0 ? 'Main entrance' : e.mapped ? `Entrance ${i + 1}` : `Fire exit ${i + 1}`))
  exits.forEach((e, i) => {
    const inward: Pt = [e.pt[0] + (xc - e.pt[0]) * 0.12, e.pt[1] + (yc - e.pt[1]) * 0.12]
    labels.push({ x: inward[0], y: inward[1], text: exitNames[i].toUpperCase() })
  })
  // the drill's fire breaks out in the room beside the exit everyone uses: the case that costs lives in real fires
  const main = exits[0] ? [fx(exits[0].pt[0]), fy(exits[0].pt[1])] : [0.5, 0.5]
  const fire = [...semRooms].sort((a, b) => Math.hypot(a.x + a.w / 2 - main[0], a.y + a.h / 2 - main[1]) - Math.hypot(b.x + b.w / 2 - main[0], b.y + b.h / 2 - main[1]))[0]

  const f = (v: number) => v.toFixed(1)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${VIEW_W} ${VIEW_H}">`,
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#ffffff"/>`,
    `<g stroke="#111" stroke-width="${f(wall)}" stroke-linecap="square">${lines.map(([p, q]) => `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`).join('')}</g>`,
    `<g fill="#9a9a9a" font-family="Arial, sans-serif" font-size="${f(Math.max(12, cell * 0.9))}" font-weight="600" text-anchor="middle">${labels.map(l => `<text x="${f(l.x)}" y="${f(l.y)}">${l.text}</text>`).join('')}</g>`,
    '</svg>',
  ].join('')

  return {
    svg,
    angle,
    walls: lines,
    wallWidth: wall,
    exitCount: exits.length,
    mappedExits: exits.filter(e => e.mapped).length,
    semantics: {
      title: '',
      rooms: semRooms,
      exits: exits.map((e, i) => ({ name: exitNames[i], x: fx(e.pt[0]), y: fy(e.pt[1]), familiar: i === 0 })),
      fireRisk: fire ? { room: fire.name, x: fire.x + fire.w / 2, y: fire.y + fire.h / 2, reason: `right beside ${exitNames[0]}, the exit everyone uses` } : null,
      notes: [],
    },
  }
}
