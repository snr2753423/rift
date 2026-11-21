import type { Scenario } from './types'

export type ScenarioId = 'kitchen_fire' | 'lab_fire' | 'all_hands'

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  kitchen_fire: {
    id: 'kitchen_fire',
    name: 'Kitchen fire — East wing',
    blurb: 'Grease fire in the kitchen spreads into the south-east; smoke pours into the east corridor.',
    ignitions: [{ cell: [41, 31], t: 0 }],
    blockedExits: [],
    occupancy: {},
    fireSpreadPerSec: 0.05,
    smokeYield: 0.9,
    seed: 11,
    tMax: 240,
  },
  lab_fire: {
    id: 'lab_fire',
    name: 'Lab fire + East Stair lost',
    blurb: 'Solvent fire beside the lab door; the East Stair is smoke-logged and closed from the start.',
    ignitions: [{ cell: [54, 24], t: 0 }, { cell: [60, 20], t: 8 }],
    blockedExits: ['E_STAIR'],
    occupancy: { OPEN_PLAN: 84 },
    fireSpreadPerSec: 0.06,
    smokeYield: 1.0,
    seed: 23,
    tMax: 240,
  },
  all_hands: {
    id: 'all_hands',
    name: 'All-hands overcrowding + lobby fire',
    blurb: '170 people packed into the conference hall when a fire breaks out by the West Lobby.',
    ignitions: [{ cell: [6, 20], t: 4 }],
    blockedExits: [],
    occupancy: { CONFERENCE: 170, OFFICE_A: 10, OFFICE_B: 12, OPEN_PLAN: 40, KITCHEN: 8, LAB: 10 },
    fireSpreadPerSec: 0.05,
    smokeYield: 0.9,
    seed: 37,
    tMax: 240,
  },
}
