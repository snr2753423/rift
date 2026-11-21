import { describe, it, expect, vi, afterEach } from 'vitest'
import { runHeadless } from '../../sim/simulation'
import { SCENARIOS } from '../../sim/scenarios'
import { BASELINE_STRATEGY } from '../../sim/strategy'

vi.mock('../simClient', () => ({
  simulate: async (scenario: never, mods: never, strategy: never) => ({ metrics: runHeadless(scenario, mods, strategy), ms: 1 }),
}))
const { runNemotronAgent, runFallbackAgent } = await import('../loop')

const sc = SCENARIOS.kitchen_fire
const baseline = runHeadless(sc, [], BASELINE_STRATEGY)
const GUIDED = { name: 'guided', congestionAwareness: 0.8, hazardAversion: 5, reassessInterval: 3, exitBias: { SW_FIREDOOR: 0.9, NE_FIREDOOR: 0.9 } }

type Turn = { reasoning?: string; content?: string; calls?: { name: string; args: unknown }[]; finish?: string }
function sseResponse(t: Turn) {
  const ev: unknown[] = []
  if (t.reasoning) ev.push({ choices: [{ delta: { reasoning_content: t.reasoning } }] })
  if (t.content) ev.push({ choices: [{ delta: { content: t.content } }] })
  t.calls?.forEach((c, i) => ev.push({ choices: [{ delta: { tool_calls: [{ index: i, id: `c${i}`, function: { name: c.name, arguments: JSON.stringify(c.args) } }] } }] }))
  ev.push({ choices: [{ delta: {}, finish_reason: t.finish ?? 'stop' }], usage: { total_tokens: 100 } })
  const body = ev.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}
function script(turns: Turn[]) {
  const bodies: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => { bodies.push(JSON.parse(init.body)); const t = turns.shift(); if (!t) throw new Error('script exhausted'); return sseResponse(t) }))
  return bodies
}
const input = () => { const events: { kind: string; text: string }[] = []; return { events, input: { scenario: sc, mods: [], baseline, onEvent: (e: { kind: string; text: string }) => { events.push(e); return events.length } } } }

afterEach(() => vi.unstubAllGlobals())

describe('Nemotron agent loop', () => {
  it('inspects, runs parallel sims, and commits a grounded strategy', async () => {
    const bodies = script([
      { reasoning: 'look first', calls: [{ name: 'inspect_environment', args: {} }] },
      { reasoning: 'try two', calls: [{ name: 'run_simulation', args: GUIDED }, { name: 'run_simulation', args: { name: 'rigid', zoneAssignments: { CONFERENCE: 'E_STAIR', OPEN_PLAN: 'E_STAIR' } } }] },
      { content: 'R1 wins', calls: [{ name: 'commit_strategy', args: { run_id: 'R1', headline: 'Guided wins', rationale: 'measured', key_changes: ['x'] } }] },
    ])
    const { events, input: inp } = input()
    const out = await runNemotronAgent(inp)
    expect(out.provider).toBe('nemotron')
    expect(out.run.id).toBe('R1')
    expect(out.runs).toHaveLength(2)
    expect(events.some(e => e.kind === 'status' && /parallel/.test(e.text))).toBe(true)
    expect(bodies[0]).toMatchObject({ stream: true, thinking: true, reasoning_budget: 1024 })
  })
  it('retries a truncated reasoning turn in direct-action mode', async () => {
    const bodies = script([
      { reasoning: 'x'.repeat(50), finish: 'length' },
      { calls: [{ name: 'run_simulation', args: GUIDED }] },
      { calls: [{ name: 'commit_strategy', args: { run_id: 'R1', headline: 'h', rationale: 'r', key_changes: [] } }] },
    ])
    const out = await runNemotronAgent(input().input)
    expect(out.run.id).toBe('R1')
    expect(bodies[1]).toMatchObject({ thinking: false })
  })
  it('auto-selects the best run when the model never commits', async () => {
    script([{ calls: [{ name: 'run_simulation', args: GUIDED }] }, { content: 'done' }, { content: 'still done' }])
    const out = await runNemotronAgent(input().input)
    expect(out.headline).toMatch(/auto-selected/)
  })
  it('fails loudly when no simulation was run', async () => {
    script([{ content: 'hello' }, { content: 'hello again' }])
    await expect(runNemotronAgent(input().input)).rejects.toThrow(/without running a simulation/)
  })
  it('surfaces proxy errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'rate limited' }), { status: 429, headers: { 'content-type': 'application/json' } })))
    await expect(runNemotronAgent(input().input)).rejects.toThrow(/rate limited/)
  })
})

describe('fallback planner', () => {
  it('is clearly labelled and picks a real simulated run', async () => {
    const { events, input: inp } = input()
    const out = await runFallbackAgent(inp)
    expect(out.provider).toBe('fallback')
    expect(events[0].text).toMatch(/DEMO FALLBACK/)
    expect(out.runs.length).toBe(3)
  })
})
