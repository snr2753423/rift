import { describe, it, expect } from 'vitest'
import { buildWorld } from '../../sim/layout'
import { SCENARIOS } from '../../sim/scenarios'
import { modFromClick } from '../mods'

const w = buildWorld(SCENARIOS.kitchen_fire, [])

describe('modFromClick', () => {
  it('blocks a horizontal corridor wall-to-wall', () => {
    const m = modFromClick('obstacle', [20, 19], w)
    expect(m?.kind).toBe('obstacle')
    if (m?.kind === 'obstacle') expect(new Set(m.cells.map(c => c[1]))).toEqual(new Set([18, 19, 20, 21]))
  })
  it('blocks the nearest exit', () => {
    expect(modFromClick('block', [61, 19], w)).toEqual({ kind: 'block_exit', exit: 'E_STAIR' })
  })
  it('ignites only walkable cells and ignores out-of-bounds', () => {
    expect(modFromClick('fire', [2, 2], w)).toEqual({ kind: 'fire', cell: [2, 2] })
    expect(modFromClick('fire', [15, 3], w)).toBeNull()
    expect(modFromClick('fire', [-1, 3], w)).toBeNull()
  })
})
