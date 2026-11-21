import { describe, expect, it } from 'vitest'
import { OFFICE_LAYOUT } from '../../sim/layout'
import { BASELINE_STRATEGY } from '../../sim/strategy'
import type { Metrics } from '../../sim/types'
import { impactOf } from '../impactStats'

const m = (o: Partial<Metrics>): Metrics => ({ total: 100, evacuated: 100, remaining: 0, incapacitated: 0, evacuationTime: 60, t90: 50, meanEgress: 30, totalExposure: 200, meanExposure: 2, peakDensity: 4, congestionIndex: 1000, exitUsage: {}, hotspots: [], curve: [], tMax: 240, complete: true, ...o })

describe('impactOf', () => {
  it('leads with lives saved when people were lost', () => {
    const i = impactOf(m({ incapacitated: 3, evacuated: 97 }), m({ incapacitated: 1, evacuated: 99, t90: 40 }), BASELINE_STRATEGY, OFFICE_LAYOUT)
    expect(i.livesSaved).toBe(2)
    expect(i.headline).toMatch(/saves 2 lives/)
    expect(i.stats.find(s => s.key === 'lives')!.text).toBe('2 lives saved')
    expect(i.stats.find(s => s.key === 't90')!.text).toBe('10s sooner')
  })
  it('says everyone survives instead of inventing a saved life', () => {
    const i = impactOf(m({}), m({ t90: 45, totalExposure: 150, congestionIndex: 700 }), BASELINE_STRATEGY, OFFICE_LAYOUT)
    expect(i.livesSaved).toBe(0)
    expect(i.headline).toMatch(/5 seconds sooner/)
    expect(i.stats.find(s => s.key === 'lives')!.text).toBe('Everyone survives')
    expect(i.stats.find(s => s.key === 'smoke')!.text).toBe('25% less')
    expect(i.stats.find(s => s.key === 'crush')!.text).toBe('30% less')
  })
  it('counts people still inside as lost, the same way in every figure', () => {
    const i = impactOf(m({ remaining: 2, evacuated: 98 }), m({}), BASELINE_STRATEGY, OFFICE_LAYOUT)
    const lives = i.stats.find(s => s.key === 'lives')!
    expect(i.livesSaved).toBe(2)
    expect(lives).toMatchObject({ before: 2, after: 0, text: '2 lives saved' })
  })
  it('reports a trade-off honestly', () => {
    const i = impactOf(m({}), m({ t90: 55 }), BASELINE_STRATEGY, OFFICE_LAYOUT)
    expect(i.stats.find(s => s.key === 't90')).toMatchObject({ better: false, text: '5s later' })
  })
  it('describes the plan from its own levers, with display names', () => {
    const s = { ...BASELINE_STRATEGY, voiceAlert: 1, hazardAversion: 6, congestionAwareness: 0.8, reassessInterval: 3, zoneAssignments: { KITCHEN: 'SW_FIREDOOR' }, exitBias: { NE_FIREDOOR: 0.6 } }
    const c = impactOf(m({}), m({}), s, OFFICE_LAYOUT).changes.join(' ')
    expect(c).toMatch(/60% sooner/)
    expect(c).toMatch(/Kitchen/)
    expect(c).not.toMatch(/SW_FIREDOOR|NE_FIREDOOR/)
    expect(c).toMatch(/every 3s/)
  })
})
