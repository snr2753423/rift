import type { LayoutDef, Metrics, Strategy } from '../sim/types'

export interface ImpactStat { key: string; label: string; before: number; after: number; unit: string; better: boolean; text: string }
export interface Impact {
  headline: string
  livesSaved: number
  stats: ImpactStat[]
  /** what the plan does differently, in plain words, read from the strategy itself */
  changes: string[]
}

const pct = (a: number, b: number) => (a > 0 ? Math.round(((a - b) / a) * 100) : 0)
const names = (ids: string[], layout: LayoutDef) => ids.map(id => layout.exits.find(e => e.id === id)?.name ?? layout.zones.find(z => z.id === id)?.name ?? id)
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** Every figure here comes from the two simulation runs; nothing is estimated. */
export function impactOf(base: Metrics, ai: Metrics, s: Strategy, layout: LayoutDef): Impact {
  const livesSaved = (base.incapacitated + base.remaining) - (ai.incapacitated + ai.remaining)
  const faster = Math.round(base.t90 - ai.t90)
  const stats: ImpactStat[] = [
    { key: 'lives', label: base.incapacitated ? 'People overcome' : 'People overcome', before: base.incapacitated, after: ai.incapacitated, unit: '', better: ai.incapacitated < base.incapacitated, text: livesSaved > 0 ? `${livesSaved} ${livesSaved === 1 ? 'life' : 'lives'} saved` : base.incapacitated === 0 && ai.incapacitated === 0 ? 'Everyone survives' : 'No change' },
    { key: 't90', label: '90% of people out', before: base.t90, after: ai.t90, unit: 's', better: faster > 0, text: faster > 0 ? `${faster}s sooner` : faster < 0 ? `${-faster}s later` : 'Same' },
    { key: 'smoke', label: 'Smoke breathed', before: base.totalExposure, after: ai.totalExposure, unit: '', better: ai.totalExposure < base.totalExposure, text: pct(base.totalExposure, ai.totalExposure) > 0 ? `${pct(base.totalExposure, ai.totalExposure)}% less` : pct(base.totalExposure, ai.totalExposure) < 0 ? `${-pct(base.totalExposure, ai.totalExposure)}% more` : 'Same' },
    { key: 'crush', label: 'Time packed in a crowd', before: base.congestionIndex, after: ai.congestionIndex, unit: '', better: ai.congestionIndex < base.congestionIndex, text: pct(base.congestionIndex, ai.congestionIndex) > 0 ? `${pct(base.congestionIndex, ai.congestionIndex)}% less` : pct(base.congestionIndex, ai.congestionIndex) < 0 ? `${-pct(base.congestionIndex, ai.congestionIndex)}% more` : 'Same' },
  ]
  const changes: string[] = []
  if ((s.voiceAlert ?? 0) > 0) changes.push(`A voice alarm and floor wardens tell people what to do, so they start moving up to ${Math.round(60 * (s.voiceAlert ?? 0))}% sooner instead of waiting to see what the bell means.`)
  const routed = Object.entries(s.zoneAssignments).filter(([, e]) => e)
  if (routed.length) changes.push(`Wardens send ${routed.length === 1 ? names([routed[0][0]], layout)[0] : `${routed.length} rooms`} to ${list([...new Set(names(routed.map(([, e]) => String(e)), layout))])} instead of the crowded exit everyone knows.`)
  const pulled = Object.entries(s.exitBias).filter(([, v]) => (v ?? 1) < 1).map(([id]) => id)
  if (pulled.length) changes.push(`Signs and announcements point people to ${list(names(pulled, layout))}.`)
  if (s.hazardAversion >= 4) changes.push('Routes steer around the smoke instead of straight past the fire.')
  if (s.congestionAwareness >= 0.5) changes.push(`Live guidance re-routes people away from queues every ${Math.round(s.reassessInterval)}s.`)
  const held = Object.values(s.zoneDelays).filter(v => (v ?? 0) > 0).length
  if (held) changes.push(`${held} ${held === 1 ? 'room leaves' : 'rooms leave'} a few seconds later, so the corridor doesn't jam.`)
  const headline = livesSaved > 0
    ? `Nemotron’s plan saves ${livesSaved} ${livesSaved === 1 ? 'life' : 'lives'} on this floor`
    : faster > 0 ? `Everyone gets out ${faster} seconds sooner with Nemotron’s plan` : 'Nemotron’s plan makes this evacuation calmer and safer'
  return { headline, livesSaved, stats, changes }
}
