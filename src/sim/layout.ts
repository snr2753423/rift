import type { Cell, Exit, ExitId, Modification, Scenario, World, Zone, ZoneId } from './types'

export const W = 64
export const H = 40
/** metres per cell */
export const CELL = 0.5

export const EXIT_IDS: ExitId[] = ['W_LOBBY', 'E_STAIR', 'N_STAIR', 'S_LOBBY', 'SW_FIREDOOR', 'NE_FIREDOOR']
export const ZONE_IDS: ZoneId[] = ['OFFICE_A', 'OFFICE_B', 'OPEN_PLAN', 'CONFERENCE', 'KITCHEN', 'LAB']

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

interface ExitDef { id: ExitId; name: string; cells: Cell[]; fireDoor: boolean }
export const EXIT_DEFS: ExitDef[] = [
  { id: 'W_LOBBY', name: 'West Lobby', cells: range(18, 21).map(y => [0, y] as Cell), fireDoor: false },
  { id: 'E_STAIR', name: 'East Stair', cells: range(18, 21).map(y => [W - 1, y] as Cell), fireDoor: false },
  { id: 'N_STAIR', name: 'North Stair', cells: range(30, 33).map(x => [x, 0] as Cell), fireDoor: false },
  { id: 'S_LOBBY', name: 'South Lobby', cells: range(30, 33).map(x => [x, H - 1] as Cell), fireDoor: false },
  { id: 'SW_FIREDOOR', name: 'Hall Fire Door', cells: range(29, 31).map(y => [0, y] as Cell), fireDoor: true },
  { id: 'NE_FIREDOOR', name: 'Office Fire Door', cells: range(57, 58).map(x => [x, 0] as Cell), fireDoor: true },
]

export const ZONE_DEFS: { id: ZoneId; name: string; rect: [number, number, number, number]; occupants: number }[] = [
  { id: 'OFFICE_A', name: 'Office A', rect: [1, 1, 14, 16], occupants: 18 },
  { id: 'OFFICE_B', name: 'Office B', rect: [16, 1, 28, 16], occupants: 22 },
  { id: 'OPEN_PLAN', name: 'Open-plan Office', rect: [35, 1, 62, 16], occupants: 70 },
  { id: 'CONFERENCE', name: 'Conference Hall', rect: [1, 23, 28, 38], occupants: 80 },
  { id: 'KITCHEN', name: 'Kitchen', rect: [35, 23, 46, 38], occupants: 24 },
  { id: 'LAB', name: 'Lab', rect: [48, 23, 62, 38], occupants: 22 },
]

/** wall segments: [x0,y0,x1,y1] with door gaps listed as cells to leave open */
const WALLS: { from: Cell; to: Cell; gaps: number[][] }[] = [
  { from: [1, 17], to: [29, 17], gaps: [[6, 7], [21, 22]] },
  { from: [34, 17], to: [62, 17], gaps: [[40, 42], [55, 56]] },
  { from: [1, 22], to: [29, 22], gaps: [[8, 10], [22, 24]] },
  { from: [34, 22], to: [62, 22], gaps: [[39, 40], [53, 54]] },
  { from: [29, 1], to: [29, 16], gaps: [[8, 9]] },
  { from: [29, 23], to: [29, 38], gaps: [[30, 31]] },
  { from: [34, 1], to: [34, 16], gaps: [[6, 7]] },
  { from: [34, 23], to: [34, 38], gaps: [[28, 29]] },
  { from: [15, 1], to: [15, 16], gaps: [[12, 13]] },
  { from: [47, 23], to: [47, 38], gaps: [[34, 35]] },
]

/** desks, tables, counters — static furniture (solid=2) */
function furniture(): Cell[] {
  const out: Cell[] = []
  for (const y of [4, 8, 12]) for (const x0 of [37, 43, 49, 55]) for (const x of range(x0, x0 + 3)) out.push([x, y])
  for (const y of range(27, 34)) for (const x of [12, 13, 14, 15, 16]) out.push([x, y]) // conference table
  for (const x of range(37, 44)) out.push([x, 36]) // kitchen counter
  for (const y of [27, 31]) for (const x of range(51, 59)) out.push([x, y]) // lab benches
  for (const y of [5, 10]) for (const x of [4, 5, 6, 9, 10, 11, 19, 20, 21, 24, 25, 26]) out.push([x, y])
  return out
}

export function buildWorld(scenario: Scenario, mods: Modification[]): World {
  const n = W * H
  const solid = new Uint8Array(n)
  const isExit = new Uint8Array(n)
  const idx = (x: number, y: number) => y * W + x
  for (let x = 0; x < W; x++) { solid[idx(x, 0)] = 1; solid[idx(x, H - 1)] = 1 }
  for (let y = 0; y < H; y++) { solid[idx(0, y)] = 1; solid[idx(W - 1, y)] = 1 }
  for (const wall of WALLS) {
    const [x0, y0] = wall.from, [x1, y1] = wall.to
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const along = x0 === x1 ? y : x
      if (wall.gaps.some(([a, b]) => along >= a && along <= b)) continue
      solid[idx(x, y)] = 1
    }
  }
  for (const [x, y] of furniture()) solid[idx(x, y)] = 2

  const blocked = new Set<ExitId>(scenario.blockedExits)
  const extraIgnitions: World['extraIgnitions'] = []
  for (const m of mods) {
    if (m.kind === 'block_exit') blocked.add(m.exit)
    if (m.kind === 'obstacle') for (const [x, y] of m.cells) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) solid[idx(x, y)] = 3
    if (m.kind === 'fire') extraIgnitions.push({ cell: m.cell, t: 0 })
  }

  const exits: Exit[] = EXIT_DEFS.map(d => {
    const isBlocked = blocked.has(d.id)
    if (!isBlocked) for (const [x, y] of d.cells) { solid[idx(x, y)] = 0; isExit[idx(x, y)] = 1 }
    return { id: d.id, name: d.name, cells: d.cells, flowRate: d.cells.length * CELL * 1.3, isFireDoor: d.fireDoor, blocked: isBlocked }
  })

  const passable = new Uint8Array(n)
  for (let i = 0; i < n; i++) passable[i] = solid[i] === 0 ? 1 : 0

  const zones: Zone[] = ZONE_DEFS.map(z => {
    const spawn: Cell[] = []
    const [x0, y0, x1, y1] = z.rect
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (passable[idx(x, y)]) spawn.push([x, y])
    return { ...z, occupants: scenario.occupancy[z.id] ?? z.occupants, spawn }
  })

  return { width: W, height: H, passable, isExit, solid, exits, zones, extraIgnitions }
}

/** Human-readable area name for a cell (used in hotspots and agent explanations). */
export function areaName(x: number, y: number): string {
  for (const z of ZONE_DEFS) { const [x0, y0, x1, y1] = z.rect; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return z.name }
  if (y >= 17 && y <= 22) {
    if (x < 30) return 'West corridor'
    if (x > 33) return 'East corridor'
    return 'Central junction'
  }
  if (x >= 29 && x <= 34) return y < 17 ? 'North corridor' : 'South corridor'
  return 'Perimeter'
}

export function zoneOf(x: number, y: number): ZoneId | null {
  for (const z of ZONE_DEFS) { const [x0, y0, x1, y1] = z.rect; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return z.id }
  return null
}
