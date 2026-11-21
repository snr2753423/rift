import { CELL, EXIT_DEFS, EXIT_IDS, ZONE_DEFS, ZONE_IDS, areaName, buildWorld } from '../sim/layout'
import { distanceField } from '../sim/navigation'
import { sanitizeStrategy } from '../sim/strategy'
import type { Metrics, Modification, Scenario, Strategy } from '../sim/types'
import { pctDelta, safetyScore } from './score'
import { simulate } from './simClient'

export interface RunRecord { id: string; strategy: Strategy; metrics: Metrics; ms: number }

export interface ToolContext {
  scenario: Scenario
  mods: Modification[]
  baseline: Metrics
  runs: Map<string, RunRecord>
  runSeq: number
  committed: { run: RunRecord; headline: string; rationale: string; changes: string[] } | null
  onRun?: (r: RunRecord) => void
}

const strategySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short name for this candidate strategy' },
    exitBias: { type: 'object', description: `Per-exit route-cost multiplier (0.25–4). <1 attracts people (signage, PA announcements), >1 repels. Keys: ${EXIT_IDS.join(', ')}`, additionalProperties: { type: 'number' } },
    zoneAssignments: { type: 'object', description: `Warden-directed exit per zone. Keys: ${ZONE_IDS.join(', ')}; values: exit ids`, additionalProperties: { type: 'string' } },
    zoneDelays: { type: 'object', description: 'Staged release: seconds (0–60) each zone waits after the alarm', additionalProperties: { type: 'number' } },
    hazardAversion: { type: 'number', description: 'How strongly routes avoid smoke/fire (0–10). Baseline 1.5' },
    congestionAwareness: { type: 'number', description: 'Live queue-aware guidance (0–1). 0 = people ignore queues' },
    reassessInterval: { type: 'number', description: 'Seconds between route reassessments (1–60). Lower = more dynamic guidance' },
  },
  required: ['name'],
}

export const TOOL_DEFS = [
  { type: 'function', function: { name: 'inspect_environment', description: 'Read the digital twin: exits with capacity and status, zones with occupancy, active hazards, user-introduced changes, and baseline (unguided) simulation metrics.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'run_simulation', description: 'Run a full deterministic agent-based evacuation simulation with a candidate strategy. Returns computed metrics and deltas vs baseline.', parameters: strategySchema } },
  { type: 'function', function: { name: 'analyze_bottlenecks', description: 'Deep analysis of a completed run: congestion hotspots, per-exit load vs capacity and clearance time, exposure.', parameters: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] } } },
  { type: 'function', function: { name: 'commit_strategy', description: 'Select the final strategy. Only commit a run that you simulated. Ground the rationale in the measured numbers.', parameters: { type: 'object', properties: { run_id: { type: 'string' }, headline: { type: 'string', description: 'One-line summary of the result' }, rationale: { type: 'string', description: '2–4 sentences citing measured metrics' }, key_changes: { type: 'array', items: { type: 'string' }, description: 'Plain-language list of operational changes vs baseline' } }, required: ['run_id', 'headline', 'rationale', 'key_changes'] } } },
]

export function compactMetrics(m: Metrics) {
  return {
    evacuation_time_s: m.complete ? m.evacuationTime : `>${m.tMax} (incomplete)`,
    t90_s: m.t90,
    mean_egress_s: m.meanEgress,
    evacuated: m.evacuated,
    incapacitated: m.incapacitated,
    still_inside: m.remaining,
    smoke_exposure_total: m.totalExposure,
    crowd_crush_person_s: m.congestionIndex,
    peak_density_p_per_m2: m.peakDensity,
    exit_usage: m.exitUsage,
  }
}

function deltas(base: Metrics, m: Metrics) {
  return {
    evacuation_time: `${pctDelta(base.evacuationTime, m.evacuationTime)}%`,
    t90: `${pctDelta(base.t90, m.t90)}%`,
    smoke_exposure: `${pctDelta(base.totalExposure, m.totalExposure)}%`,
    crowd_crush: `${pctDelta(base.congestionIndex, m.congestionIndex)}%`,
    incapacitated: m.incapacitated - base.incapacitated,
  }
}

export function describeMod(m: Modification): string {
  if (m.kind === 'block_exit') return `${EXIT_DEFS.find(e => e.id === m.exit)?.name ?? m.exit} (${m.exit}) is now BLOCKED`
  if (m.kind === 'fire') return `New fire ignited in ${areaName(m.cell[0], m.cell[1])} at cell (${m.cell[0]},${m.cell[1]})`
  const [x, y] = m.cells[Math.floor(m.cells.length / 2)]
  return `Obstacle (${m.label ?? 'debris'}) blocking ${areaName(x, y)} around cell (${x},${y})`
}

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  let args: Record<string, unknown> = {}
  try { args = rawArgs ? JSON.parse(rawArgs) : {} } catch { return { error: 'arguments were not valid JSON' } }

  if (name === 'inspect_environment') {
    const world = buildWorld(ctx.scenario, ctx.mods)
    const fields = world.exits.map(e => (e.blocked ? null : distanceField(world, e.cells, () => 0)))
    const zoneExitDistances = Object.fromEntries(world.zones.map(z => {
      const [x0, y0, x1, y1] = z.rect
      const c = z.spawn.reduce((b, p) => (Math.hypot(p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2) < Math.hypot(b[0] - (x0 + x1) / 2, b[1] - (y0 + y1) / 2) ? p : b), z.spawn[0])
      const d: Record<string, number> = {}
      world.exits.forEach((e, i) => { const f = fields[i]; const v = f?.[c[1] * world.width + c[0]]; if (v !== undefined && Number.isFinite(v)) d[e.id] = Math.round(v * CELL) })
      return [z.id, d]
    }))
    return {
      building: 'Single-storey office, 32 m × 20 m, 0.5 m simulation grid',
      scenario: { name: ctx.scenario.name, description: ctx.scenario.blurb },
      exits: world.exits.map(e => ({ id: e.id, name: e.name, width_m: e.cells.length * 0.5, capacity_persons_per_s: Math.round(e.flowRate * 100) / 100, status: e.blocked ? 'BLOCKED' : 'open', fire_door: e.isFireDoor })),
      zones: world.zones.map(z => ({ id: z.id, name: z.name, occupants: z.occupants })),
      walking_distance_m_from_zone_centre_to_exit: zoneExitDistances,
      hazards: [...ctx.scenario.ignitions.map(i => `Fire at t=${i.t}s in ${areaName(i.cell[0], i.cell[1])}`), ...ctx.mods.map(describeMod)],
      baseline_strategy: 'Unguided self-evacuation: occupants pick familiar/nearest exits, underuse fire doors (bias 1.8), ignore queues, reassess every 20 s.',
      baseline_metrics: compactMetrics(ctx.baseline),
      baseline_bottlenecks: ctx.baseline.hotspots,
    }
  }

  if (name === 'run_simulation') {
    const strategy = sanitizeStrategy(args)
    const id = `R${++ctx.runSeq}`
    const { metrics, ms } = await simulate(ctx.scenario, ctx.mods, strategy)
    const rec = { id, strategy, metrics, ms }
    ctx.runs.set(id, rec)
    ctx.onRun?.(rec)
    return { run_id: id, applied_strategy: strategy, metrics: compactMetrics(metrics), vs_baseline: deltas(ctx.baseline, metrics), top_bottlenecks: metrics.hotspots, compute_ms: ms }
  }

  if (name === 'analyze_bottlenecks') {
    const rec = ctx.runs.get(String(args.run_id))
    if (!rec) return { error: `unknown run_id ${String(args.run_id)}; available: ${[...ctx.runs.keys()].join(', ') || 'none'}` }
    const exits = EXIT_DEFS.map(d => {
      const used = rec.metrics.exitUsage[d.id]
      const cap = d.cells.length * 0.5 * 1.3
      return { id: d.id, people: used, capacity_pps: Math.round(cap * 100) / 100, min_clearance_s: Math.round((used / cap) * 10) / 10 }
    }).sort((a, b) => b.min_clearance_s - a.min_clearance_s)
    return {
      run_id: rec.id,
      hotspots: rec.metrics.hotspots,
      exit_load_ranked: exits,
      insight_hint: 'An exit whose min_clearance_s is far above the others is the bottleneck; shifting zones to under-loaded open exits usually reduces t90.',
      evacuation_curve_every_10s: rec.metrics.curve.filter((_, i) => i % 10 === 9),
      zones: ZONE_DEFS.map(z => z.id),
    }
  }

  if (name === 'commit_strategy') {
    const rec = ctx.runs.get(String(args.run_id))
    if (!rec) return { error: `unknown run_id ${String(args.run_id)} — you must commit a run you simulated` }
    if (safetyScore(rec.metrics) > safetyScore(ctx.baseline)) {
      return { error: `run ${rec.id} is worse than the baseline on the safety score (incapacitations, t90, exposure). Try another strategy before committing.` }
    }
    ctx.committed = {
      run: rec,
      headline: String(args.headline ?? '').slice(0, 160),
      rationale: String(args.rationale ?? '').slice(0, 1200),
      changes: Array.isArray(args.key_changes) ? args.key_changes.map(String).slice(0, 8) : [],
    }
    return { ok: true, committed: rec.id }
  }

  return { error: `unknown tool ${name}` }
}
