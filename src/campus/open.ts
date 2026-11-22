import { importPlan, type Step } from '../import/pipeline'
import { useRift } from '../state/store'
import type { Spot } from './data'
import { generatePlan } from './plan'

/** Build the twin for one floor of a campus building and load it (no camera work; callers handle transitions). */
export async function openFloor(spot: Spot, floor: number, onSteps: (s: Step[]) => void = () => {}) {
  const origin = spot.official ? (spot.tamuOutline ? 'Outline, doors and floor count from Texas A&M Facilities GIS' : 'Doors and floor count from Texas A&M Facilities GIS, outline from OpenStreetMap') : 'Outline from OpenStreetMap'
  const plan = generatePlan({ footprint: spot.footprint, entrances: spot.entrances, rooms: spot.rooms, floor })
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`
  const r = await importPlan(src, onSteps, { fallback: plan.semantics, title: `${spot.short} · Floor ${floor}`, vision: false })
  const source = floor === 1
    ? `${origin}; ${plan.mappedExits} of ${plan.exitCount} exits at real entrances.`
    : `${origin}; floor ${floor} of ${spot.floors}, exits by stairwell.`
  // campus drills model a serious fire beside the everyday exit: faster spread and thicker, more toxic smoke than the demo office
  const scenario = { ...r.scenario, fireSpreadPerSec: 0.22, smokeYield: 3.2, incapacitation: 24 }
  const s = useRift.getState()
  s.loadCustom(scenario, { ...r.info, notes: [`${source} The interior layout is schematic, not the real floor plan.`, ...r.info.notes] })
  s.set({ building: spot.name, floor, floors: spot.floors })
  return r
}
