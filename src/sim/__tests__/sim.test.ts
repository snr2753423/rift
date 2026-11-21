import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../rng'
import { buildWorld, EXIT_IDS, ZONE_IDS, OFFICE_LAYOUT } from '../layout'
import { distanceField, astar } from '../navigation'
import { HazardField } from '../hazards'
import { runHeadless } from '../simulation'
import { BASELINE_STRATEGY, sanitizeStrategy } from '../strategy'
import { SCENARIOS } from '../scenarios'

const calm = { ...SCENARIOS.kitchen_fire, ignitions: [], id: 'calm' as const }

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(7), b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('layout', () => {
  const w = buildWorld(SCENARIOS.kitchen_fire, [])
  it('places every exit on the outer border', () => {
    for (const e of w.exits) for (const [x, y] of e.cells)
      expect(x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1).toBe(true)
  })
  it('every zone can reach at least one exit', () => {
    const fields = w.exits.map(e => distanceField(w, e.cells, () => 0))
    for (const z of w.zones) {
      const [cx, cy] = z.spawn[0]
      expect(fields.some(f => Number.isFinite(f[cy * w.width + cx]))).toBe(true)
    }
  })
  it('exposes stable ids', () => {
    expect(EXIT_IDS.length).toBe(6)
    expect(ZONE_IDS.length).toBe(6)
  })
  it('builds a world from a custom layout and validates strategy ids against it', () => {
    const solid = new Uint8Array(64 * 40)
    for (let x = 0; x < 64; x++) { solid[x] = 1; solid[39 * 64 + x] = 1 }
    for (let y = 0; y < 40; y++) { solid[y * 64] = 1; solid[y * 64 + 63] = 1 }
    const layout = { ...OFFICE_LAYOUT, id: 'custom', corridors: false, solid,
      exits: [{ id: 'EXIT_1', name: 'Door', cells: [[0, 20], [0, 21]] as [number, number][], fireDoor: false }],
      zones: [{ id: 'ROOM_1', name: 'Hall', rect: [5, 5, 30, 30] as [number, number, number, number], occupants: 30 }] }
    const scenario = { ...calm, layout }
    const m = runHeadless(scenario, [], BASELINE_STRATEGY)
    expect(m.total).toBe(30)
    expect(m.remaining).toBe(0)
    expect(Object.keys(m.exitUsage)).toEqual(['EXIT_1'])
    const s = sanitizeStrategy({ zoneAssignments: { ROOM_1: 'EXIT_1', LAB: 'E_STAIR' } }, layout)
    expect(s.zoneAssignments).toEqual({ ROOM_1: 'EXIT_1' })
  })
})

describe('navigation', () => {
  const w = buildWorld(calm, [])
  it('distance field is 0 on the exit and grows away from it', () => {
    const e = w.exits[0]
    const f = distanceField(w, e.cells, () => 0)
    const [x, y] = e.cells[0]
    expect(f[y * w.width + x]).toBe(0)
    expect(f[(w.height >> 1) * w.width + (w.width >> 1)]).toBeGreaterThan(5)
  })
  it('A* finds a path that never enters a wall', () => {
    const p = astar(w, [2, 2], [60, 35])
    expect(p).not.toBeNull()
    for (const [x, y] of p!) expect(w.passable[y * w.width + x]).toBe(1)
  })
  it('A* returns null when the goal is a wall', () => {
    expect(astar(w, [2, 2], [0, 5])).toBeNull()
  })
})

describe('hazards', () => {
  it('fire spreads over time, smoke stays in [0,1] and never enters walls', () => {
    const w = buildWorld(SCENARIOS.kitchen_fire, [])
    const h = new HazardField(w, SCENARIOS.kitchen_fire, mulberry32(1))
    for (let i = 0; i < 600; i++) h.step(0.1, i * 0.1)
    const burning = h.fire.filter(v => v > 0).length
    expect(burning).toBeGreaterThan(3)
    for (let i = 0; i < h.smoke.length; i++) {
      expect(h.smoke[i]).toBeGreaterThanOrEqual(0)
      expect(h.smoke[i]).toBeLessThanOrEqual(1)
      if (!w.passable[i] && !w.isExit[i]) { expect(h.smoke[i]).toBe(0); expect(h.fire[i]).toBe(0) }
    }
  })
})

describe('simulation', () => {
  it('is deterministic for the same seed', () => {
    const a = runHeadless(SCENARIOS.kitchen_fire, [], BASELINE_STRATEGY)
    const b = runHeadless(SCENARIOS.kitchen_fire, [], BASELINE_STRATEGY)
    expect(a.evacuationTime).toBe(b.evacuationTime)
    expect(a.totalExposure).toBe(b.totalExposure)
  })
  it('conserves occupants', () => {
    const m = runHeadless(SCENARIOS.kitchen_fire, [], BASELINE_STRATEGY)
    expect(m.evacuated + m.remaining + m.incapacitated).toBe(m.total)
  })
  it('evacuates everyone with no hazard', () => {
    const m = runHeadless(calm, [], BASELINE_STRATEGY)
    expect(m.remaining).toBe(0)
    expect(m.incapacitated).toBe(0)
    expect(m.evacuationTime).toBeLessThan(m.tMax)
  })
  it('blocking exits slows evacuation', () => {
    const open = runHeadless(calm, [], BASELINE_STRATEGY)
    const blocked = runHeadless(calm, [{ kind: 'block_exit', exit: 'W_LOBBY' }, { kind: 'block_exit', exit: 'S_LOBBY' }], BASELINE_STRATEGY)
    expect(blocked.evacuationTime).toBeGreaterThan(open.evacuationTime)
  })
  it('zone assignment steers usage toward the assigned exit', () => {
    const s = sanitizeStrategy({ zoneAssignments: { CONFERENCE: 'SW_FIREDOOR' } })
    const m = runHeadless(calm, [], s)
    const base = runHeadless(calm, [], BASELINE_STRATEGY)
    expect(m.exitUsage.SW_FIREDOOR).toBeGreaterThan(base.exitUsage.SW_FIREDOOR)
  })
})

describe('strategy', () => {
  it('clamps values and drops unknown ids', () => {
    const s = sanitizeStrategy({ hazardAversion: 99, congestionAwareness: -3, exitBias: { NOPE: 2, E_STAIR: 50 }, zoneAssignments: { LAB: 'MOON' }, zoneDelays: { LAB: 999 } } as never)
    expect(s.hazardAversion).toBe(10)
    expect(s.congestionAwareness).toBe(0)
    expect(s.exitBias.E_STAIR).toBe(4)
    expect('NOPE' in s.exitBias).toBe(false)
    expect(s.zoneAssignments.LAB ?? null).toBeNull()
    expect(s.zoneDelays.LAB).toBe(60)
  })
})
