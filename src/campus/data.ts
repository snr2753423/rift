import { FEATURED, type Featured } from './buildings'
import type { GreenData } from './Greenery'
import { floorsFor, principalAngle, toPoints, type Pt } from './plan'

export interface CampusBuilding { n?: string; h: number; p: number[]; e?: Pt[] }
export interface CampusData extends GreenData { attribution: string; center: [number, number]; buildings: CampusBuilding[]; roads: { k: 'major' | 'minor' | 'path'; p: number[] }[] }

/** A featured building with the geometry the camera and the twin need. */
export interface Spot extends Featured {
  footprint: number[]
  entrances: Pt[]
  height: number
  center: Pt
  size: number
  floors: number
  /** doors and floor count come from Texas A&M Facilities GIS (else OpenStreetMap) */
  official: boolean
  /** the outline itself is the university's */
  tamuOutline: boolean
  angle: number
}

/** One building as Texas A&M Facilities GIS records it (scripts/build-official.mjs). */
export interface Official { abbrev: string; floors: number | null; footprint: number[]; entrances: Pt[] }
export interface OfficialData { source: string; buildings: Record<string, Official> }

/** Merge a featured building's sources: the university's record first, OpenStreetMap for anything missing. */
export function spotFrom(f: Featured, b: CampusBuilding | undefined, o: Official | undefined): Spot | null {
  const tamuOutline = Boolean(o?.footprint?.length) && !(f.osmOutline && b?.p)
  const footprint = tamuOutline ? o!.footprint : b?.p
  if (!footprint || footprint.length < 6) return null
  const entrances = o?.entrances?.length ? o.entrances : b?.e ?? []
  const floors = o?.floors ?? f.floors ?? floorsFor(b?.h ?? 9)
  const pts = toPoints(footprint)
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1])
  return {
    ...f, footprint, entrances, floors, height: floors * 3.6, official: Boolean(o), tamuOutline, angle: principalAngle(pts),
    center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2],
    size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
  }
}

let cache: Promise<{ data: CampusData; spots: Spot[] }> | null = null

export function loadCampus() {
  cache ??= Promise.all([
    fetch('/campus.json').then(r => { if (!r.ok) throw new Error(`campus map ${r.status}`); return r.json() as Promise<CampusData> }),
    fetch('/official.json').then(r => (r.ok ? r.json() as Promise<OfficialData> : null)).catch(() => null),
  ]).then(([data, official]) => {
    const spots = FEATURED.map(f => spotFrom(f, data.buildings.find(x => x.n === f.name), official?.buildings[f.name])).filter((s): s is Spot => s !== null)
    return { data, spots }
  })
  return cache
}
