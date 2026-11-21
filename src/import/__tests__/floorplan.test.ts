import { describe, it, expect } from 'vitest'
import { findContentBox, rasterToGrid, buildImportedScenario, parseSemantics, type RasterImage } from '../floorplan'
import { runHeadless } from '../../sim/simulation'
import { baselineFor } from '../../sim/strategy'

/** 640×400 white image with a black outer wall (8px) and one interior wall with a door gap. */
function plan(): RasterImage {
  const w = 640, h = 400, data = new Uint8ClampedArray(w * h * 4).fill(255)
  const dark = (x: number, y: number) => { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 10 }
  for (let y = 20; y < 380; y++) for (let x = 20; x < 620; x++) {
    const outer = x < 28 || x >= 612 || y < 28 || y >= 372
    const inner = x >= 316 && x < 324 && !(y > 180 && y < 220)
    if (outer || inner) dark(x, y)
  }
  return { width: w, height: h, data }
}

describe('floor-plan CV', () => {
  it('finds the drawing bounds', () => {
    const b = findContentBox(plan())
    expect(b.x0).toBeLessThanOrEqual(20)
    expect(b.x1).toBeGreaterThanOrEqual(619)
    expect(b.y0).toBeLessThanOrEqual(20)
  })
  it('grids walls with a passable door gap', () => {
    const img = plan()
    const g = rasterToGrid(img, findContentBox(img), 64, 40)
    expect(g[20 * 64 + 32] + g[20 * 64 + 31]).toBe(0) // door gap open
    expect(g[8 * 64 + 31] || g[8 * 64 + 32]).toBe(1) // interior wall present
    expect(g[20 * 64 + 10]).toBe(0) // room floor open
  })
})

describe('semantics', () => {
  it('parses JSON wrapped in prose and drops invalid entries', () => {
    const s = parseSemantics('Sure! {"title":"T","rooms":[{"name":"A","x":0.1,"y":0.1,"w":0.3,"h":0.6,"occupants":20},{"name":"bad","x":"q"}],"exits":[{"name":"Front","x":0,"y":0.5},{"x":9,"y":9}],"fire_risk":{"room":"A","x":0.2,"y":0.3,"reason":"stove"}} thanks')
    expect(s?.rooms.length).toBe(1)
    expect(s?.exits.length).toBe(1)
    expect(s?.fireRisk?.reason).toBe('stove')
  })
  it('returns null for garbage', () => { expect(parseSemantics('no json here')).toBeNull() })
})

describe('imported scenario', () => {
  it('builds a runnable scenario where everyone can evacuate', () => {
    const img = plan()
    const grid = rasterToGrid(img, findContentBox(img), 64, 40)
    const { scenario } = buildImportedScenario(grid, {
      title: 'Test plan',
      rooms: [{ name: 'West room', x: 0.05, y: 0.1, w: 0.4, h: 0.8, occupants: 25 }, { name: 'East room', x: 0.55, y: 0.1, w: 0.4, h: 0.8, occupants: 25 }],
      exits: [{ name: 'West door', x: 0, y: 0.5 }, { name: 'East door', x: 1, y: 0.3 }],
      fireRisk: { room: 'East room', x: 0.8, y: 0.7, reason: 'test' },
      notes: [],
    })
    expect(scenario.layout?.exits.length).toBe(2)
    expect(scenario.ignitions.length).toBe(1)
    const m = runHeadless({ ...scenario, ignitions: [] }, [], baselineFor(scenario.layout))
    expect(m.total).toBeGreaterThanOrEqual(50) // surge occupancy may exceed the model's headcount
    expect(m.remaining).toBe(0)
  })
  it('falls back to default exits and sectors when semantics are empty', () => {
    const img = plan()
    const grid = rasterToGrid(img, findContentBox(img), 64, 40)
    const { scenario, notes } = buildImportedScenario(grid, null)
    expect(scenario.layout!.exits.length).toBeGreaterThanOrEqual(2)
    expect(scenario.layout!.zones.length).toBeGreaterThan(0)
    expect(notes.join(' ')).toMatch(/fallback/i)
  })
})
