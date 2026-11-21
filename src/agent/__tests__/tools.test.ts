import { describe, it, expect, vi } from 'vitest'
import { runHeadless } from '../../sim/simulation'
import { SCENARIOS } from '../../sim/scenarios'
import { BASELINE_STRATEGY } from '../../sim/strategy'

vi.mock('../simClient', () => ({
  simulate: async (scenario: never, mods: never, strategy: never) => ({ metrics: runHeadless(scenario, mods, strategy), ms: 1 }),
}))

const { executeTool, describeMod } = await import('../tools')
const { safetyScore, pctDelta } = await import('../score')

const sc = SCENARIOS.kitchen_fire
const baseline = runHeadless(sc, [], BASELINE_STRATEGY)
const ctx = () => ({ scenario: sc, mods: [], baseline, runs: new Map(), runSeq: 0, committed: null })

describe('agent tools', () => {
  it('inspect_environment exposes exits, zones, distances and baseline', async () => {
    const r = await executeTool('inspect_environment', '', ctx()) as Record<string, unknown>
    expect((r.exits as unknown[]).length).toBe(6)
    expect(Object.keys(r.walking_distance_m_from_zone_centre_to_exit as object)).toContain('CONFERENCE')
    expect((r.baseline_metrics as Record<string, unknown>).t90_s).toBe(baseline.t90)
  })
  it('run_simulation returns real metrics and stores the run', async () => {
    const c = ctx()
    const r = await executeTool('run_simulation', JSON.stringify({ name: 'x', congestionAwareness: 0.8 }), c) as Record<string, unknown>
    expect(r.run_id).toBe('R1')
    expect(c.runs.get('R1')).toBeTruthy()
  })
  it('rejects malformed JSON and unknown tools', async () => {
    expect(await executeTool('run_simulation', '{oops', ctx())).toHaveProperty('error')
    expect(await executeTool('nope', '{}', ctx())).toHaveProperty('error')
  })
  it('refuses to commit an unknown run or a run worse than baseline', async () => {
    const c = ctx()
    expect(await executeTool('commit_strategy', JSON.stringify({ run_id: 'R9' }), c)).toHaveProperty('error')
    // routing everyone through one exit is reliably worse
    await executeTool('run_simulation', JSON.stringify({ name: 'bad', zoneAssignments: { OFFICE_A: 'E_STAIR', OFFICE_B: 'E_STAIR', CONFERENCE: 'E_STAIR', OPEN_PLAN: 'E_STAIR', KITCHEN: 'E_STAIR', LAB: 'E_STAIR' } }), c)
    const r = await executeTool('commit_strategy', JSON.stringify({ run_id: 'R1', headline: 'h', rationale: 'r', key_changes: [] }), c)
    expect(r).toHaveProperty('error')
    expect(c.committed).toBeNull()
  })
  it('commits a better run', async () => {
    const c = ctx()
    await executeTool('run_simulation', JSON.stringify({ name: 'guided', congestionAwareness: 0.8, hazardAversion: 5, reassessInterval: 3, exitBias: { SW_FIREDOOR: 0.9, NE_FIREDOOR: 0.9 } }), c)
    const r = await executeTool('commit_strategy', JSON.stringify({ run_id: 'R1', headline: 'h', rationale: 'r', key_changes: ['a'] }), c)
    expect(r).toEqual({ ok: true, committed: 'R1' })
    expect(c.committed).not.toBeNull()
  })
  it('score and delta helpers', () => {
    expect(pctDelta(100, 80)).toBe(-20)
    expect(pctDelta(0, 5)).toBe(0)
    expect(safetyScore({ ...baseline, incapacitated: baseline.incapacitated + 1 })).toBeGreaterThan(safetyScore(baseline))
    expect(describeMod({ kind: 'block_exit', exit: 'E_STAIR' })).toMatch(/East Stair/)
  })
})
