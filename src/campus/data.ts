import { FEATURED, type Featured } from './buildings'
import type { GreenData } from './Greenery'
import { principalAngle, toPoints, type Pt } from './plan'

export interface CampusBuilding { n?: string; h: number; p: number[]; e?: Pt[] }
export interface CampusData extends GreenData { attribution: string; center: [number, number]; buildings: CampusBuilding[]; roads: { k: 'major' | 'minor' | 'path'; p: number[] }[] }

/** A featured building with the geometry the camera and the twin need. */
export interface Spot extends Featured {
  footprint: number[]
  entrances: Pt[]
  height: number
  center: Pt
  size: number
  angle: number
}

let cache: Promise<{ data: CampusData; spots: Spot[] }> | null = null

export function loadCampus() {
  cache ??= fetch('/campus.json').then(r => { if (!r.ok) throw new Error(`campus map ${r.status}`); return r.json() as Promise<CampusData> }).then(data => {
    const spots: Spot[] = []
    for (const f of FEATURED) {
      const b = data.buildings.find(x => x.n === f.name)
      if (!b) continue
      const pts = toPoints(b.p)
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1])
      spots.push({
        ...f, footprint: b.p, entrances: b.e ?? [], height: b.h, angle: principalAngle(pts),
        center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2],
        size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
      })
    }
    return { data, spots }
  })
  return cache
}
