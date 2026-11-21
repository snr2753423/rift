import { OFFICE_LAYOUT } from './layout'
import type { ExitId, LayoutDef, Strategy, ZoneId } from './types'

/** Occupants self-evacuate: nearest-familiar exit, fire doors underused (documented in egress studies), no live guidance. */
export function baselineFor(layout: LayoutDef = OFFICE_LAYOUT): Strategy {
  return { ...BASELINE_STRATEGY, exitBias: Object.fromEntries(layout.exits.filter(e => e.fireDoor).map(e => [e.id, 1.8])) }
}

export const BASELINE_STRATEGY: Strategy = {
  name: 'Baseline — unguided self-evacuation',
  exitBias: { SW_FIREDOOR: 1.8, NE_FIREDOOR: 1.8 },
  zoneAssignments: {},
  zoneDelays: {},
  hazardAversion: 1.5,
  congestionAwareness: 0,
  reassessInterval: 20,
}

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

/** Validate untrusted strategy input (LLM tool arguments) into a safe Strategy. */
export function sanitizeStrategy(raw: Partial<Record<keyof Strategy, unknown>> | null | undefined, layout: LayoutDef = OFFICE_LAYOUT): Strategy {
  const exitIds = new Set(layout.exits.map(e => e.id)), zoneIds = new Set(layout.zones.map(z => z.id))
  const isExit = (v: unknown): v is ExitId => typeof v === 'string' && exitIds.has(v)
  const isZone = (v: unknown): v is ZoneId => typeof v === 'string' && zoneIds.has(v)
  const r = (raw ?? {}) as Record<string, unknown>
  const exitBias: Strategy['exitBias'] = {}
  const eb = (r.exitBias ?? {}) as Record<string, unknown>
  for (const k of Object.keys(eb)) if (isExit(k)) exitBias[k] = clamp(eb[k], 0.25, 4, 1)
  const zoneAssignments: Strategy['zoneAssignments'] = {}
  const za = (r.zoneAssignments ?? {}) as Record<string, unknown>
  for (const k of Object.keys(za)) if (isZone(k) && isExit(za[k])) zoneAssignments[k] = za[k] as ExitId
  const zoneDelays: Strategy['zoneDelays'] = {}
  const zd = (r.zoneDelays ?? {}) as Record<string, unknown>
  for (const k of Object.keys(zd)) if (isZone(k)) zoneDelays[k] = clamp(zd[k], 0, 60, 0)
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 80) : 'Candidate strategy',
    exitBias,
    zoneAssignments,
    zoneDelays,
    hazardAversion: clamp(r.hazardAversion, 0, 10, 3),
    congestionAwareness: clamp(r.congestionAwareness, 0, 1, 0.5),
    reassessInterval: clamp(r.reassessInterval, 1, 60, 5),
  }
}
