import { describe, expect, it } from 'vitest'
import { treeSpots } from '../Greenery'
import { pointInPolygon, type Pt } from '../plan'

const lawn = [0, 0, 100, 0, 100, 60, 0, 60, 0, 0]
const square: Pt[] = [[0, 0], [100, 0], [100, 60], [0, 60]]

describe('treeSpots', () => {
  it('keeps every mapped tree', () => {
    expect(treeSpots({ trees: [5, 5, 50, 20] }).slice(0, 2)).toEqual([[5, 5], [50, 20]])
  })
  it('scatters decorative trees only inside lawns, the same way every time', () => {
    const a = treeSpots({ green: [{ k: 'grass', p: lawn }] })
    expect(a.length).toBeGreaterThan(5)
    expect(a.every(p => pointInPolygon(p, square))).toBe(true)
    expect(treeSpots({ green: [{ k: 'grass', p: lawn }] })).toEqual(a)
  })
  it('leaves sports pitches clear', () => {
    expect(treeSpots({ green: [{ k: 'pitch', p: lawn }] })).toEqual([])
  })
})
