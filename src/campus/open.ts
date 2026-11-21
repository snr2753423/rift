import { importPlan, type Step } from '../import/pipeline'
import { useRift } from '../state/store'
import type { Spot } from './data'
import { floorsFor, generatePlan } from './plan'

/** Build the twin for one floor of a campus building and load it (no camera work; callers handle transitions). */
export async function openFloor(spot: Spot, floor: number, onSteps: (s: Step[]) => void = () => {}) {
  const plan = generatePlan({ footprint: spot.footprint, entrances: spot.entrances, rooms: spot.rooms, floor })
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`
  const r = await importPlan(src, onSteps, { fallback: plan.semantics, title: `${spot.short} · Floor ${floor}`, vision: false })
  const source = floor === 1
    ? `Footprint from OpenStreetMap; ${plan.mappedExits} of ${plan.exitCount} exits at mapped entrances.`
    : `Footprint from OpenStreetMap; floor ${floor} exits are stairwells.`
  // campus drills model a serious fire: faster spread and thicker smoke than the demo office
  const scenario = { ...r.scenario, fireSpreadPerSec: 0.09, smokeYield: 1.6 }
  const s = useRift.getState()
  s.loadCustom(scenario, { ...r.info, notes: [`${source} The interior layout is schematic, not the real floor plan.`, ...r.info.notes] })
  s.set({ building: spot.name, floor, floors: floorsFor(spot.height) })
  return r
}
