import type { Metrics } from '../sim/types'

/** Lower is better. Life safety dominates, then time, then exposure, then crowd crush. */
export function safetyScore(m: Metrics): number {
  return m.incapacitated * 100 + m.remaining * 100 + m.t90 + 0.5 * m.evacuationTime + 2 * m.meanExposure + m.congestionIndex / 100
}

export function pctDelta(base: number, v: number): number {
  if (!base) return 0
  return Math.round(((v - base) / base) * 1000) / 10
}
