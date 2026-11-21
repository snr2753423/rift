import type { Cell, World } from './types'

/** Minimal binary heap keyed by priority. */
class Heap {
  private ids: number[] = []
  private pr: number[] = []
  get size() { return this.ids.length }
  push(id: number, p: number) {
    const ids = this.ids, pr = this.pr
    let i = ids.length
    ids.push(id); pr.push(p)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (pr[parent] <= p) break
      ids[i] = ids[parent]; pr[i] = pr[parent]; i = parent
    }
    ids[i] = id; pr[i] = p
  }
  pop(): number {
    const ids = this.ids, pr = this.pr
    const top = ids[0]
    const lastId = ids.pop()!, lastP = pr.pop()!
    if (ids.length) {
      let i = 0
      const n = ids.length
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i, mp = lastP
        if (l < n && pr[l] < mp) { m = l; mp = pr[l] }
        if (r < n && pr[r] < mp) { m = r; mp = pr[r] }
        if (m === i) break
        ids[i] = ids[m]; pr[i] = pr[m]; i = m
      }
      ids[i] = lastId; pr[i] = lastP
    }
    return top
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
]

/**
 * Multi-source Dijkstra "flow field": cost-to-go from every cell to the given targets.
 * extraCost(i) adds per-cell penalty (smoke, fire); Infinity makes a cell impassable.
 */
export function distanceField(world: World, targets: Cell[], extraCost: (i: number) => number): Float32Array {
  const { width: w, height: h, passable } = world
  const dist = new Float32Array(w * h).fill(Infinity)
  const heap = new Heap()
  for (const [x, y] of targets) {
    const i = y * w + x
    if (!passable[i]) continue
    dist[i] = 0; heap.push(i, 0)
  }
  while (heap.size) {
    const i = heap.pop()
    const d = dist[i]
    const x = i % w, y = (i / w) | 0
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (!passable[j]) continue
      // no corner cutting through walls
      if (dx && dy && (!passable[y * w + nx] || !passable[ny * w + x])) continue
      const extra = extraCost(j)
      if (extra === Infinity) continue
      const nd = d + c * (1 + extra)
      if (nd < dist[j]) { dist[j] = nd; heap.push(j, nd) }
    }
  }
  return dist
}

/** A* route query between two cells (used by the agent's route-inspection tool and route ribbons). */
export function astar(world: World, start: Cell, goal: Cell, extraCost: (i: number) => number = () => 0): Cell[] | null {
  const { width: w, height: h, passable } = world
  const s = start[1] * w + start[0], g = goal[1] * w + goal[0]
  if (!passable[s] || !passable[g]) return null
  const gScore = new Float32Array(w * h).fill(Infinity)
  const came = new Int32Array(w * h).fill(-1)
  const heap = new Heap()
  const hfn = (i: number) => {
    const dx = Math.abs((i % w) - goal[0]), dy = Math.abs(((i / w) | 0) - goal[1])
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }
  gScore[s] = 0; heap.push(s, hfn(s))
  while (heap.size) {
    const i = heap.pop()
    if (i === g) {
      const path: Cell[] = []
      for (let c = g; c !== -1; c = came[c]) path.push([c % w, (c / w) | 0])
      return path.reverse()
    }
    const x = i % w, y = (i / w) | 0
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (!passable[j]) continue
      if (dx && dy && (!passable[y * w + nx] || !passable[ny * w + x])) continue
      const extra = extraCost(j)
      if (extra === Infinity) continue
      const ng = gScore[i] + c * (1 + extra)
      if (ng < gScore[j]) { gScore[j] = ng; came[j] = i; heap.push(j, ng + hfn(j)) }
    }
  }
  return null
}
