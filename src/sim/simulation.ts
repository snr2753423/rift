import { HazardField } from './hazards'
import { CELL, areaName, buildWorld } from './layout'
import { distanceField } from './navigation'
import { mulberry32 } from './rng'
import type { Cell, Hotspot, Metrics, Modification, Scenario, Strategy, World } from './types'

export const DT = 0.1
const CROWD_DENSITY = 2.5 // persons/m² — above this, flow degrades sharply (Fruin LoS E/F)
export const INCAPACITATION = 45 // smoke-seconds of exposure (simplified dose model)
const FIELD_REFRESH = 1.0
const CELL_AREA = CELL * CELL

export const AgentState = { Waiting: 0, Moving: 1, Exited: 2, Incapacitated: 3 } as const

/** Weidmann (1993) fundamental diagram: walking speed fraction at density rho (p/m²). */
export function weidmann(rho: number): number {
  if (rho <= 0.5) return 1
  return Math.max(0.06, 1 - Math.exp(-1.913 * (1 / rho - 1 / 5.4)))
}

/**
 * Agent-based evacuation simulation on a 0.5 m grid. Hot-loop state lives in typed arrays that are
 * mutated in place for speed — the one deliberate exception to the immutability rule.
 */
export class Simulation {
  readonly world: World
  readonly hazards: HazardField
  readonly n: number
  readonly px: Float32Array
  readonly py: Float32Array
  readonly state: Uint8Array
  readonly exitIdx: Int8Array
  readonly exposure: Float32Array
  /** per person: exit used (−1 until out), seconds spent in a crush (> crowd density) */
  readonly exitedVia: Int8Array
  readonly crushTime: Float32Array
  readonly density: Float32Array
  readonly congestion: Float32Array
  readonly exitCount: number[]
  readonly queue: number[]
  readonly curve: number[] = []
  t = 0
  evacuated = 0
  incapacitated = 0
  peakDensity = 0
  crowdSeconds = 0
  totalExposure = 0
  private vmax: Float32Array
  private start: Float32Array
  readonly zone: Uint8Array
  readonly egress: Float32Array
  private nextReassess: Float32Array
  fields: (Float32Array | null)[] = []
  private fieldTimer = 0
  private tokens: number[]
  private exitOfCell: Int8Array
  private head: Int32Array
  private link: Int32Array
  private counts: Uint16Array
  private curveTimer = 0

  constructor(readonly scenario: Scenario, mods: Modification[], readonly strategy: Strategy) {
    this.world = buildWorld(scenario, mods)
    const w = this.world
    this.hazards = new HazardField(w, scenario, mulberry32(scenario.seed ^ 0x9e3779b9))
    const pop = mulberry32(scenario.seed)
    this.n = w.zones.reduce((s, z) => s + z.occupants, 0)
    const n = this.n
    this.px = new Float32Array(n); this.py = new Float32Array(n)
    this.state = new Uint8Array(n); this.exitIdx = new Int8Array(n).fill(-1)
    this.exposure = new Float32Array(n); this.vmax = new Float32Array(n)
    this.start = new Float32Array(n); this.zone = new Uint8Array(n)
    this.egress = new Float32Array(n); this.nextReassess = new Float32Array(n)
    this.exitedVia = new Int8Array(n).fill(-1); this.crushTime = new Float32Array(n)
    let a = 0
    // nobody starts the drill standing in the fire itself
    const lit = [...scenario.ignitions, ...w.extraIgnitions].filter(ig => ig.t <= 0).map(ig => ig.cell)
    const clear = (c: Cell) => lit.every(([x, y]) => Math.max(Math.abs(c[0] - x), Math.abs(c[1] - y)) > 2)
    w.zones.forEach((z, zi) => {
      const safe = z.spawn.filter(clear)
      const spawn = safe.length ? safe : z.spawn
      for (let k = 0; k < z.occupants; k++, a++) {
        const [cx, cy] = spawn[Math.floor(pop() * spawn.length)]
        this.px[a] = cx + 0.2 + pop() * 0.6
        this.py[a] = cy + 0.2 + pop() * 0.6
        this.vmax[a] = (1.15 + pop() * 0.4) / CELL // m/s -> cells/s
        // pre-movement: 4–18 s with a plain bell; a directed voice message and wardens cut it by up to 60%
        this.start[a] = (4 + pop() * 14) * (1 - 0.6 * (strategy.voiceAlert ?? 0)) + (strategy.zoneDelays[z.id] ?? 0)
        this.zone[a] = zi
      }
    })
    const cells = w.width * w.height
    this.density = new Float32Array(cells)
    this.congestion = new Float32Array(cells)
    this.counts = new Uint16Array(cells)
    this.head = new Int32Array(cells)
    this.link = new Int32Array(n)
    this.exitCount = w.exits.map(() => 0)
    this.queue = w.exits.map(() => 0)
    this.tokens = w.exits.map(() => 1)
    this.exitOfCell = new Int8Array(cells).fill(-1)
    w.exits.forEach((e, ei) => { if (!e.blocked) for (const [x, y] of e.cells) this.exitOfCell[y * w.width + x] = ei })
    this.refreshFields()
  }

  /** smoke dose that overcomes a person in this scenario */
  get dose() { return this.scenario.incapacitation ?? INCAPACITATION }

  get done() { return this.evacuated + this.incapacitated >= this.n || this.t >= this.scenario.tMax }

  private refreshFields() {
    const { fire, smoke } = this.hazards
    const w = this.world
    const av = this.strategy.hazardAversion
    const cost = (i: number) => {
      if (fire[i] > 0.15) return Infinity
      const x = i % w.width
      let near = 0
      if (fire[i - 1] > 0 || fire[i + 1] > 0 || fire[i - w.width] > 0 || fire[i + w.width] > 0 || x < 0) near = 1
      return av * (smoke[i] * 2 + near * 1.5)
    }
    this.fields = w.exits.map(e => (e.blocked ? null : distanceField(w, e.cells, cost)))
  }

  private chooseExit(i: number, ci: number): number {
    const s = this.strategy, w = this.world
    const z = w.zones[this.zone[i]].id
    const assigned = s.zoneAssignments[z]
    if (assigned) {
      const ai = w.exits.findIndex(e => e.id === assigned)
      const f = this.fields[ai]
      if (f && Number.isFinite(f[ci])) return ai
    }
    let best = -1, bestCost = Infinity
    for (let e = 0; e < w.exits.length; e++) {
      const f = this.fields[e]
      if (!f || !Number.isFinite(f[ci])) continue
      const wait = this.queue[e] / w.exits[e].flowRate
      const c = f[ci] * (s.exitBias[w.exits[e].id] ?? 1) + s.congestionAwareness * wait * 2.6
      if (c < bestCost) { bestCost = c; best = e }
    }
    return best
  }

  step(dt = DT) {
    if (this.done) return
    const w = this.world, W = w.width
    this.t += dt
    this.hazards.step(dt, this.t)
    this.fieldTimer += dt
    if (this.fieldTimer >= FIELD_REFRESH) { this.fieldTimer = 0; this.refreshFields() }
    const { fire, smoke } = this.hazards

    // spatial hash + density
    this.counts.fill(0); this.head.fill(-1)
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] >= AgentState.Exited) continue
      const ci = (this.py[i] | 0) * W + (this.px[i] | 0)
      this.counts[ci]++; this.link[i] = this.head[ci]; this.head[ci] = i
    }
    let peak = 0
    for (let y = 1; y < w.height - 1; y++) for (let x = 1; x < W - 1; x++) {
      const ci = y * W + x
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += this.counts[ci + dy * W + dx]
      const rho = s / (9 * CELL_AREA)
      this.density[ci] = rho
      if (rho > peak) peak = rho
      if (rho > CROWD_DENSITY && this.counts[ci]) this.congestion[ci] += dt
    }
    this.peakDensity = Math.max(this.peakDensity, peak)
    for (let e = 0; e < w.exits.length; e++) {
      this.tokens[e] = Math.min(Math.max(1, w.exits[e].flowRate * 0.5), this.tokens[e] + w.exits[e].flowRate * dt)
    }
    const newQueue = w.exits.map(() => 0)

    for (let i = 0; i < this.n; i++) {
      const st = this.state[i]
      if (st >= AgentState.Exited) continue
      let x = this.px[i], y = this.py[i]
      let ci = (y | 0) * W + (x | 0)
      const sm = smoke[ci]
      this.exposure[i] += sm * dt
      if (this.density[ci] > CROWD_DENSITY) this.crushTime[i] += dt
      this.totalExposure += sm * dt
      if (fire[ci] > 0.4 || this.exposure[i] > this.dose) { this.state[i] = AgentState.Incapacitated; this.incapacitated++; continue }
      if (this.t < this.start[i]) continue
      if (st === AgentState.Waiting) this.state[i] = AgentState.Moving

      let e = this.exitIdx[i]
      const field = e >= 0 ? this.fields[e] : null
      if (e < 0 || !field || !Number.isFinite(field[ci]) || this.t >= this.nextReassess[i]) {
        e = this.chooseExit(i, ci)
        this.exitIdx[i] = e
        this.nextReassess[i] = this.t + this.strategy.reassessInterval
      }
      if (e < 0) continue // trapped: no reachable exit
      const f = this.fields[e]!
      if (f[ci] < 12) newQueue[e]++

      // steer toward lowest-cost neighbour
      const cx = x | 0, cy = y | 0
      let bx = cx, by = cy, bv = f[ci]
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.height) continue
        const nj = ny * W + nx
        if (!w.passable[nj]) continue
        if (dx && dy && (!w.passable[cy * W + nx] || !w.passable[ny * W + cx])) continue
        if (f[nj] < bv) { bv = f[nj]; bx = nx; by = ny }
      }
      let dirX = bx + 0.5 - x, dirY = by + 0.5 - y
      const len = Math.hypot(dirX, dirY) || 1
      dirX /= len; dirY /= len

      // separation from neighbours
      let sx = 0, sy = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.height) continue
        for (let j = this.head[ny * W + nx]; j !== -1; j = this.link[j]) {
          if (j === i) continue
          const ox = x - this.px[j], oy = y - this.py[j]
          const d = Math.hypot(ox, oy)
          if (d > 0 && d < 0.75) { sx += (ox / d) * (0.75 - d); sy += (oy / d) * (0.75 - d) }
        }
      }
      const rho = this.density[ci]
      if (rho > CROWD_DENSITY) this.crowdSeconds += dt
      const speed = this.vmax[i] * weidmann(rho) * (1 - 0.5 * sm)
      let mx = (dirX * speed + sx * 1.5) * dt, my = (dirY * speed + sy * 1.5) * dt
      const step = Math.hypot(mx, my)
      if (step > 0.45) { mx *= 0.45 / step; my *= 0.45 / step } // never skip a whole cell (no tunnelling through 1-cell walls)
      let nx = x + mx
      let ny = y + my
      const ok = (px: number, py: number) => w.passable[(py | 0) * W + (px | 0)] === 1
      if (!ok(nx, ny)) {
        if (ok(nx, y)) ny = y
        else if (ok(x, ny)) nx = x
        else { nx = x; ny = y }
      }
      const nci = (ny | 0) * W + (nx | 0)
      const exitHere = this.exitOfCell[nci]
      if (exitHere >= 0) {
        if (this.tokens[exitHere] >= 1) {
          this.tokens[exitHere] -= 1
          this.state[i] = AgentState.Exited
          this.egress[i] = this.t
          this.exitedVia[i] = exitHere
          this.exitCount[exitHere]++
          this.evacuated++
          this.px[i] = nx; this.py[i] = ny
          continue
        }
        // doorway saturated: wait just inside
        nx = x; ny = y
      }
      this.px[i] = nx; this.py[i] = ny
      ci = nci
    }
    for (let e = 0; e < w.exits.length; e++) this.queue[e] = newQueue[e]
    this.curveTimer += dt
    if (this.curveTimer >= 1 - 1e-6) { this.curveTimer = 0; this.curve.push(this.evacuated) }
  }

  metrics(): Metrics {
    const w = this.world
    const exited: number[] = []
    for (let i = 0; i < this.n; i++) if (this.state[i] === AgentState.Exited) exited.push(this.egress[i])
    exited.sort((a, b) => a - b)
    const remaining = this.n - this.evacuated - this.incapacitated
    const complete = remaining === 0
    const t90i = Math.ceil(this.n * 0.9) - 1
    const exitUsage: Record<string, number> = Object.fromEntries(w.exits.map((e, ei) => [e.id, this.exitCount[ei]]))
    return {
      total: this.n,
      evacuated: this.evacuated,
      remaining,
      incapacitated: this.incapacitated,
      evacuationTime: round1(complete && exited.length ? exited[exited.length - 1] : this.scenario.tMax),
      t90: round1(exited.length > t90i ? exited[t90i] : this.scenario.tMax),
      meanEgress: round1(exited.length ? exited.reduce((a, b) => a + b, 0) / exited.length : 0),
      totalExposure: round1(this.totalExposure),
      meanExposure: round1(this.totalExposure / this.n),
      peakDensity: round1(this.peakDensity),
      congestionIndex: round1(this.crowdSeconds),
      exitUsage,
      hotspots: this.hotspots(),
      curve: [...this.curve],
      tMax: this.scenario.tMax,
      complete,
    }
  }

  /** Dominant route per zone, traced down the exit's flow field (for glowing path ribbons). */
  routes(): { zone: number; exit: number; points: [number, number][]; share: number }[] {
    const w = this.world, W = w.width
    const out: { zone: number; exit: number; points: [number, number][]; share: number }[] = []
    w.zones.forEach((z, zi) => {
      const votes = new Map<number, number>()
      let first = -1, active = 0
      for (let i = 0; i < this.n; i++) {
        if (this.zone[i] !== zi || this.state[i] >= AgentState.Exited) continue
        active++
        if (first < 0) first = i
        if (this.exitIdx[i] >= 0) votes.set(this.exitIdx[i], (votes.get(this.exitIdx[i]) ?? 0) + 1)
      }
      if (!active || first < 0) return
      const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1])
      const [x0, y0, x1, y1] = z.rect
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
      const start = z.spawn.reduce((b, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(b[0] - mx, b[1] - my) ? c : b), z.spawn[0])
      const exits = ranked.length ? ranked.slice(0, 2) : [[this.chooseExit(first, start[1] * W + start[0]), active] as [number, number]]
      for (const [e, cnt] of exits) {
        const f = e >= 0 ? this.fields[e] : null
        if (!f) continue
        let cx = start[0], cy = start[1]
        const pts: [number, number][] = [[cx + 0.5, cy + 0.5]]
        for (let k = 0; k < 400; k++) {
          let bx = cx, by = cy, bv = f[cy * W + cx]
          if (bv === 0 || !Number.isFinite(bv)) break
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= w.height) continue
            const v = f[ny * W + nx]
            if (v < bv) { bv = v; bx = nx; by = ny }
          }
          if (bx === cx && by === cy) break
          cx = bx; cy = by
          pts.push([cx + 0.5, cy + 0.5])
        }
        if (pts.length > 2) out.push({ zone: zi, exit: e, points: pts, share: cnt / active })
      }
    })
    return out
  }

  private hotspots(): Hotspot[] {
    const W = this.world.width
    const order = Array.from(this.congestion.keys()).filter(i => this.congestion[i] > 0.5).sort((a, b) => this.congestion[b] - this.congestion[a])
    const out: Hotspot[] = []
    for (const i of order) {
      const x = i % W, y = (i / W) | 0
      if (out.some(h => Math.abs(h.x - x) + Math.abs(h.y - y) < 8)) continue
      out.push({ x, y, area: areaName(x, y, this.world.layout), seconds: round1(this.congestion[i]) })
      if (out.length === 3) break
    }
    return out
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** Run a full simulation without rendering — this is what the AI agent's tool calls execute. */
export function runHeadless(scenario: Scenario, mods: Modification[], strategy: Strategy): Metrics {
  const sim = new Simulation(scenario, mods, strategy)
  while (!sim.done) sim.step(DT)
  return sim.metrics()
}
