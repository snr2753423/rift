import type { Cell } from '../sim/types'

export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }
export interface Box { x0: number; y0: number; x1: number; y1: number }
/** Where the drawing sits inside the simulation grid (aspect ratio preserved, 1-cell outside margin). */
export interface Fit { x: number; y: number; w: number; h: number }
export interface GridResult { solid: Uint8Array; fit: Fit; W: number; H: number }

/** solid value for "outside the building": not floor, not wall, never walkable or rendered */
export const VOID = 4

const DARK = 110 // luminance below this counts as ink (walls)
const lum = (d: Uint8ClampedArray, i: number) => (d[i + 3] < 40 ? 255 : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])

/** Bounding box of the drawing's ink. */
export function findContentBox(img: RasterImage): Box {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (lum(img.data, (y * img.width + x) * 4) < DARK) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: img.width - 1, y1: img.height - 1 }
  return { x0, y0, x1, y1 }
}

/**
 * Pixel-threshold wall extraction into a W×H grid, keeping the drawing's proportions (letterboxed, never stretched).
 * A cell is wall if ≥12% of its pixels are ink.
 */
export function rasterToGrid(img: RasterImage, box: Box, W: number, H: number, frac = 0.12): GridResult {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1
  const scale = Math.min((W - 2) / bw, (H - 2) / bh) // cells per pixel
  const fw = Math.max(1, Math.min(W - 2, Math.round(bw * scale))), fh = Math.max(1, Math.min(H - 2, Math.round(bh * scale)))
  const fit = { x: Math.floor((W - fw) / 2), y: Math.floor((H - fh) / 2), w: fw, h: fh }
  const solid = new Uint8Array(W * H)
  for (let cy = 0; cy < fh; cy++) for (let cx = 0; cx < fw; cx++) {
    const px0 = box.x0 + Math.floor((cx / fw) * bw), px1 = Math.max(box.x0 + Math.floor(((cx + 1) / fw) * bw), px0 + 1)
    const py0 = box.y0 + Math.floor((cy / fh) * bh), py1 = Math.max(box.y0 + Math.floor(((cy + 1) / fh) * bh), py0 + 1)
    let ink = 0, total = 0
    for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) { total++; if (lum(img.data, (y * img.width + x) * 4) < DARK) ink++ }
    if (total && ink / total >= frac) solid[(fit.y + cy) * W + fit.x + cx] = 1
  }
  return { solid, fit, W, H }
}

/** Morphological closing of a binary mask (8-neighbourhood): fills gaps up to ~2r cells, e.g. door openings. */
export function close(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  // pad with empty space so walls touching the grid edge close/erode like any other wall
  const p = r + 1, PW = W + 2 * p, PH = H + 2 * p
  let cur = new Uint8Array(PW * PH)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cur[(y + p) * PW + x + p] = mask[y * W + x]
  for (const grow of [true, false]) {
    for (let k = 0; k < r; k++) {
      const next = new Uint8Array(PW * PH)
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        let any = false, all = true
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          const v = nx < 0 || ny < 0 || nx >= PW || ny >= PH ? 0 : cur[ny * PW + nx]
          if (v) any = true; else all = false
        }
        next[y * PW + x] = (grow ? any : all) ? 1 : 0
      }
      cur = next
    }
  }
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = cur[(y + p) * PW + x + p]
  return out
}

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** 4-connected components of cells where `inside(i)` holds. */
function components(W: number, H: number, inside: (i: number) => boolean): number[][] {
  const seen = new Uint8Array(W * H)
  const out: number[][] = []
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !inside(s)) continue
    const comp: number[] = []
    const stack = [s]
    seen[s] = 1
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % W, y = (i / W) | 0
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = ny * W + nx
        if (!seen[j] && inside(j)) { seen[j] = 1; stack.push(j) }
      }
    }
    out.push(comp)
  }
  return out
}

export interface Segmentation {
  /** 0 floor · 1 wall · VOID outside */
  cls: Uint8Array
  /** each walled area's cells (door cells included), largest first */
  rooms: Cell[][]
  /** cell → room index, -1 for none */
  roomOf: Int16Array
  /** gaps in the building envelope (floor cells touching the outside), one cell list per opening */
  openings: Cell[][]
}

const toCell = (i: number, W: number): Cell => [i % W, (i / W) | 0]

/**
 * Turn a wall grid into building geometry: what is outside (flood fill from the border with door gaps closed),
 * which floor areas are separate walled rooms (components after closing door-sized gaps), and where the envelope opens.
 */
export function segmentPlan(solid: Uint8Array, W: number, H: number): Segmentation {
  const n = W * H
  const wall = Uint8Array.from(solid, v => (v === 1 ? 1 : 0))
  let wx0 = W, wy0 = H, wx1 = -1, wy1 = -1
  for (let i = 0; i < n; i++) if (wall[i]) { const x = i % W, y = (i / W) | 0; wx0 = Math.min(wx0, x); wx1 = Math.max(wx1, x); wy0 = Math.min(wy0, y); wy1 = Math.max(wy1, y) }
  let open = 0
  for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) if (!wall[y * W + x]) open++

  // outside = border-connected space once envelope gaps are closed; widen the closing if a big opening leaks in
  let ext = new Uint8Array(n)
  for (const r of [3, 5, 8]) {
    const closed = close(wall, W, H, r)
    ext = new Uint8Array(n)
    const border: number[] = []
    for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x)
    for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1)
    const stack = border.filter(i => !closed[i])
    for (const i of stack) ext[i] = 1
    while (stack.length) {
      const i = stack.pop()!
      const x = i % W, y = (i / W) | 0
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = ny * W + nx
        if (!ext[j] && !closed[j]) { ext[j] = 1; stack.push(j) }
      }
    }
    let interior = 0
    for (let i = 0; i < n; i++) if (!ext[i] && !wall[i]) interior++
    if (interior >= open * 0.3) break
  }

  const cls = new Uint8Array(n)
  for (let i = 0; i < n; i++) cls[i] = wall[i] ? 1 : ext[i] ? VOID : 0
  // ink that is not part of the building (labels, dimension lines outside it) becomes outside
  for (let i = 0; i < n; i++) {
    if (cls[i] !== 1) continue
    const x = i % W, y = (i / W) | 0
    let nearFloor = false
    for (let dy = -2; dy <= 2 && !nearFloor; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && cls[ny * W + nx] === 0) { nearFloor = true; break }
    }
    if (!nearFloor) cls[i] = VOID
  }

  const touchesOutside = (i: number) => {
    const x = i % W, y = (i / W) | 0
    return N4.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= W || ny >= H || cls[ny * W + nx] === VOID })
  }
  const gaps = components(W, H, i => cls[i] === 0 && touchesOutside(i))

  // rooms: close door-sized gaps, take floor components, then give door cells back to the nearest room.
  // Door width in cells depends on drawing scale, so try ≤2-cell and ≤4-cell doors and keep the finer split.
  const roomsFor = (r: number) => {
    const doorsShut = close(wall, W, H, r)
    return components(W, H, i => cls[i] === 0 && !doorsShut[i]).filter(c => c.length >= 6).sort((a, b) => b.length - a.length)
  }
  const small = roomsFor(1), wide = roomsFor(2)
  const comps = wide.length > small.length ? wide : small
  const roomOf = new Int16Array(n).fill(-1)
  comps.forEach((c, k) => { for (const i of c) roomOf[i] = k })
  let frontier = comps.flat()
  while (frontier.length) {
    const next: number[] = []
    for (const i of frontier) {
      const x = i % W, y = (i / W) | 0
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = ny * W + nx
        if (cls[j] === 0 && roomOf[j] === -1) { roomOf[j] = roomOf[i]; next.push(j) }
      }
    }
    frontier = next
  }
  const rooms: Cell[][] = comps.map(() => [])
  for (let i = 0; i < n; i++) if (roomOf[i] >= 0) rooms[roomOf[i]].push(toCell(i, W))
  // a gap only counts as an exit if it leads into a room (not a sliver of floor caught in a notch of the outline)
  const openings = gaps.filter(c => c.length >= 2 && c.some(i => roomOf[i] >= 0))
    .sort((a, b) => b.length - a.length).slice(0, 8).map(c => c.map(i => toCell(i, W)))
  return { cls, rooms, roomOf, openings }
}
