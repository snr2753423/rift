import { describe, expect, it } from 'vitest'
import { buildImportedScenario, findContentBox, rasterToGrid, type RasterImage } from '../../import/floorplan'
import { runHeadless } from '../../sim/simulation'
import { baselineFor } from '../../sim/strategy'
import { FEATURED } from '../buildings'
import { clipLine, floorsFor, generatePlan, principalAngle, toPoints, type Pt } from '../plan'
import campusRaw from '../../../public/campus.json?raw'

const campus = JSON.parse(campusRaw) as { buildings: { n?: string; h: number; p: number[]; e?: Pt[] }[] }

/** Rasterize wall segments the way a browser would draw the SVG (square caps). */
function rasterize(walls: [Pt, Pt][], width: number): RasterImage {
  const w = 1280, h = 800, data = new Uint8ClampedArray(w * h * 4).fill(255), r = width / 2
  for (const [[x0, y0], [x1, y1]] of walls) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / len, uy = (y1 - y0) / len
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r)), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + r))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r)), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + r))
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const dx = x - x0, dy = y - y0, along = dx * ux + dy * uy, across = Math.abs(dx * uy - dy * ux)
      if (along >= -r && along <= len + r && across <= r) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 17 }
    }
  }
  return { width: w, height: h, data }
}

describe('plan geometry', () => {
  it('finds the long axis of a rotated rectangle', () => {
    const a = 0.4, rect: Pt[] = [[0, 0], [100, 0], [100, 30], [0, 30]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])
    expect(principalAngle(rect)).toBeCloseTo(a, 5)
  })
  it('clips a line to an L-shaped polygon', () => {
    const L: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
    expect(clipLine(L, 0, 2)).toEqual([[0, 10]])
    expect(clipLine(L, 0, 6)).toEqual([[0, 4]])
  })
  it('drops the repeated closing point', () => { expect(toPoints([0, 0, 1, 0, 1, 1, 0, 0])).toHaveLength(3) })
})

describe('featured campus buildings', () => {
  for (const f of FEATURED) {
    const b = campus.buildings.find(x => x.n === f.name)
    it(`${f.short} is in the campus data`, () => { expect(b).toBeTruthy() })
    if (!b) continue
    for (let floor = 1; floor <= floorsFor(b.h); floor++) it(`${f.short} floor ${floor}: everyone can evacuate`, () => {
      const plan = generatePlan({ footprint: b.p, entrances: b.e, rooms: f.rooms, floor })
      if (floor > 1) expect(plan.semantics.exits.every(e => e.name.startsWith('Stair'))).toBe(true)
      expect(plan.exitCount).toBeGreaterThanOrEqual(2)
      const img = rasterize(plan.walls, plan.wallWidth)
      const grid = rasterToGrid(img, findContentBox(img), 64, 40)
      const { scenario } = buildImportedScenario(grid, { ...plan.semantics, title: f.name })
      expect(scenario.layout!.exits.length).toBeGreaterThanOrEqual(2)
      expect(scenario.layout!.zones.length).toBeGreaterThanOrEqual(3)
      // no fire: checks every occupant has a route out
      const m = runHeadless({ ...scenario, ignitions: [] }, [], baselineFor(scenario.layout))
      expect(m.remaining).toBe(0)
    })
  }
})
