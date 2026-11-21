import { AgentState, INCAPACITATION, type Simulation } from './simulation'

/** What a drill means for the people in the building, from a finished (or running) simulation. */
export interface Outcome {
  total: number
  out: number
  /** overcome by smoke or fire */
  casualties: number
  /** got out, but after a heavy smoke dose (≥ 40% of the incapacitation dose) */
  injured: number
  /** seconds until 90% are out (null if never reached) */
  t90: number | null
  /** average seconds each person spent packed in a crush (> 2.5 people/m²) */
  crushPerPerson: number
  peakDensity: number
  /** share of this floor's walkable area on fire; the same under any plan */
  fireDamage: number
}

export function outcomeOf(sim: Simulation): Outcome {
  let injured = 0, crush = 0
  for (let i = 0; i < sim.n; i++) {
    crush += sim.crushTime[i]
    if (sim.state[i] === AgentState.Exited && sim.exposure[i] >= INCAPACITATION * 0.4) injured++
  }
  const need = Math.ceil(sim.n * 0.9)
  const k = sim.curve.findIndex(v => v >= need)
  let floor = 0, burning = 0
  const { passable } = sim.world
  for (let c = 0; c < passable.length; c++) if (passable[c]) { floor++; if (sim.hazards.fire[c] > 0.4) burning++ }
  return {
    total: sim.n,
    out: sim.evacuated,
    casualties: sim.incapacitated,
    injured,
    t90: k >= 0 ? k + 1 : null,
    crushPerPerson: sim.n ? crush / sim.n : 0,
    peakDensity: sim.peakDensity,
    fireDamage: floor ? burning / floor : 0,
  }
}

export type YouStatus = 'waiting' | 'moving' | 'out' | 'overcome'

export interface You {
  status: YouStatus
  /** escape time, seconds after the alarm */
  time: number | null
  exit: string | null
  heading: string | null
  crush: number
  /** smoke dose as a share of the incapacitation dose (0–1+) */
  smoke: number
}

export function youIn(sim: Simulation, i: number): You {
  const st = sim.state[i]
  const exit = sim.exitedVia[i] >= 0 ? sim.world.exits[sim.exitedVia[i]]?.name ?? null : null
  const heading = sim.exitIdx[i] >= 0 ? sim.world.exits[sim.exitIdx[i]]?.name ?? null : null
  return {
    status: st === AgentState.Exited ? 'out' : st === AgentState.Incapacitated ? 'overcome' : st === AgentState.Moving ? 'moving' : 'waiting',
    time: st === AgentState.Exited ? sim.egress[i] : null,
    exit,
    heading,
    crush: sim.crushTime[i],
    smoke: sim.exposure[i] / INCAPACITATION,
  }
}

/** The person standing closest to `near` (a grid cell) inside zone `zi`, or that zone's most central person. */
export function personInZone(sim: Simulation, zi: number, near?: [number, number]): number {
  const z = sim.world.zones[zi]
  let cx = near?.[0], cy = near?.[1]
  if (cx === undefined || cy === undefined) {
    const cells = z?.spawn ?? []
    cx = cells.reduce((a, c) => a + c[0], 0) / Math.max(1, cells.length)
    cy = cells.reduce((a, c) => a + c[1], 0) / Math.max(1, cells.length)
  }
  let best = -1, bd = Infinity
  for (let i = 0; i < sim.n; i++) {
    if (sim.zone[i] !== zi) continue
    const d = Math.hypot(sim.px[i] - cx - 0.5, sim.py[i] - cy - 0.5)
    if (d < bd) { bd = d; best = i }
  }
  return best
}

/** Zone index at a grid cell, or −1 (walls, outside). */
export function zoneAt(sim: Simulation, [x, y]: [number, number]): number {
  const L = sim.world.layout
  if (L.zoneMap) return L.zoneMap[y * L.width + x] ?? -1
  return sim.world.zones.findIndex(z => x >= z.rect[0] && x <= z.rect[2] && y >= z.rect[1] && y <= z.rect[3])
}
