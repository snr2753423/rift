import { describe, it, expect } from 'vitest'
import { findContentBox, rasterToGrid, segmentPlan, buildImportedScenario, VOID, type RasterImage } from '../floorplan'
import { runHeadless } from '../../sim/simulation'
import { baselineFor } from '../../sim/strategy'
import { buildWorld } from '../../sim/layout'

const W = 64, H = 40

/** Draw a raster from dark rectangles [x0,y0,x1,y1] on white. */
function raster(w: number, h: number, rects: number[][]): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 10
  }
  return { width: w, height: h, data }
}

// L-shaped building in 640×400 px: top wing full width, left wing down. Walls 8 px. Two exits (gaps in the outer wall),
// one interior wall splitting the top wing (door gap ~2 cells), one sealed store room (no door) in the left wing.
const T = 8
const L_PLAN = raster(640, 400, [
  [20, 20, 620, 20 + T], // top
  [20, 20, 20 + T, 170], [20, 210, 20 + T, 380], // left wall with exit gap y 170–210
  [612, 20, 620, 200], // right of top wing
  [320, 192, 620, 200], // bottom of top wing (right part)
  [320, 192, 328, 380], // right wall of left wing
  [20, 372, 200, 380], [240, 372, 328, 380], // bottom with exit gap x 200–240
  [470, 20, 478, 90], [470, 110, 478, 200], // interior wall in top wing, door gap y 90–110
  [120, 280, 128, 372], [20, 280, 120, 288], // sealed store room in the bottom-left corner
])

describe('shape-true import', () => {
  const box = findContentBox(L_PLAN)
  const grid = rasterToGrid(L_PLAN, box, W, H)

  it('keeps the aspect ratio instead of stretching to the grid', () => {
    const sq = raster(400, 400, [[20, 20, 380, 28], [20, 372, 380, 380], [20, 20, 28, 380], [372, 20, 380, 380]])
    const g = rasterToGrid(sq, findContentBox(sq), W, H)
    expect(Math.abs(g.fit.w - g.fit.h)).toBeLessThanOrEqual(1)
    expect(g.fit.w).toBeLessThan(W - 10)
  })

  it('marks the outside of the building as void, including the notch of the L', () => {
    const seg = segmentPlan(grid.solid, W, H)
    const notch = (x: number, y: number) => seg.cls[y * W + x]
    // a point in the empty bottom-right quadrant of the L
    const nx = grid.fit.x + Math.round(grid.fit.w * 0.8), ny = grid.fit.y + Math.round(grid.fit.h * 0.8)
    expect(notch(nx, ny)).toBe(VOID)
    // a point inside the top wing is floor
    const fx = grid.fit.x + Math.round(grid.fit.w * 0.3), fy = grid.fit.y + Math.round(grid.fit.h * 0.25)
    expect(notch(fx, fy)).toBe(0)
  })

  it('finds every walled area as its own room', () => {
    const seg = segmentPlan(grid.solid, W, H)
    expect(seg.rooms.length).toBe(3) // main L area, top-right room, sealed store
  })

  it('detects exits from gaps in the outer wall without any AI help', () => {
    const seg = segmentPlan(grid.solid, W, H)
    expect(seg.openings.length).toBe(2)
  })

  it('builds a runnable twin: no floor outside, sealed rooms get a door, everyone escapes', () => {
    const { scenario, notes } = buildImportedScenario(grid, null)
    const world = buildWorld({ ...scenario, ignitions: [] }, [])
    expect(world.exits.length).toBe(2)
    expect(world.zones.length).toBe(3)
    expect(notes.join(' ')).toMatch(/sealed/i)
    const m = runHeadless({ ...scenario, ignitions: [] }, [], baselineFor(scenario.layout))
    expect(m.remaining).toBe(0)
    expect(m.incapacitated).toBe(0)
  })

  it('names rooms from the vision model by where its boxes land', () => {
    const { scenario } = buildImportedScenario(grid, {
      title: 'L', notes: [], fireRisk: null, exits: [],
      rooms: [{ name: 'Office', x: 0.8, y: 0.15, w: 0.15, h: 0.25 }, { name: 'Store', x: 0.02, y: 0.75, w: 0.15, h: 0.2 }],
    })
    const names = scenario.layout!.zones.map(z => z.name)
    expect(names).toContain('Office')
    expect(names).toContain('Store')
  })
})
