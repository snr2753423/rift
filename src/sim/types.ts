/** exit / zone ids are layout-defined strings (the built-in office uses W_LOBBY, CONFERENCE, …) */
export type ExitId = string
export type ZoneId = string
export type Cell = readonly [number, number]

export interface Exit {
  id: ExitId
  name: string
  cells: Cell[]
  /** persons per second through the doorway (~1.3 p/m/s × width) */
  flowRate: number
  isFireDoor: boolean
  blocked: boolean
}

export interface Zone {
  id: ZoneId
  name: string
  rect: [number, number, number, number] // x0,y0,x1,y1 inclusive
  occupants: number
  spawn: Cell[]
}

export interface Ignition { cell: Cell; t: number }

export interface ExitDef { id: ExitId; name: string; cells: Cell[]; fireDoor: boolean; /** the exit people use every day */ familiar?: boolean }
export interface ZoneDef {
  id: ZoneId
  name: string
  /** bounding box; also the spawn area when `cells` is absent */
  rect: [number, number, number, number]
  occupants: number
  /** exact room shape (imported plans); spawn and area names use these cells */
  cells?: Cell[]
}

/** Static building description: grid of solids (1 wall, 2 furniture) + exits + occupied zones. */
export interface LayoutDef {
  id: string
  name: string
  width: number
  height: number
  solid: Uint8Array
  exits: ExitDef[]
  zones: ZoneDef[]
  /** office layout only: named corridor bands for area names and wall-to-wall obstacles */
  corridors: boolean
  source?: string
  /** cell → zone index (-1 none) for exact-shape rooms */
  zoneMap?: Int16Array
}

export interface Scenario {
  id: string
  layout?: LayoutDef
  name: string
  blurb: string
  ignitions: Ignition[]
  blockedExits: ExitId[]
  occupancy: Partial<Record<ZoneId, number>>
  fireSpreadPerSec: number
  smokeYield: number
  /** smoke-seconds of exposure that overcome a person (default INCAPACITATION) */
  incapacitation?: number
  seed: number
  tMax: number
}

export type Modification =
  | { kind: 'obstacle'; cells: Cell[]; label?: string }
  | { kind: 'fire'; cell: Cell }
  | { kind: 'block_exit'; exit: ExitId }

export interface World {
  layout: LayoutDef
  width: number
  height: number
  /** 1 = walkable floor (exits included) */
  passable: Uint8Array
  isExit: Uint8Array
  /** wall=1, furniture/obstacle=2, user obstacle=3, else 0 */
  solid: Uint8Array
  exits: Exit[]
  zones: Zone[]
  extraIgnitions: Ignition[]
}

export interface Strategy {
  name: string
  /** multiplier on perceived route cost per exit (people's preference / signage) */
  exitBias: Partial<Record<ExitId, number>>
  /** warden-directed exit per zone */
  zoneAssignments: Partial<Record<ZoneId, ExitId | null>>
  /** staged release, seconds after alarm */
  zoneDelays: Partial<Record<ZoneId, number>>
  /** voice evacuation message + floor wardens (0 = alarm bell only, 1 = full): shortens the delay before people start moving */
  voiceAlert?: number
  /** how strongly routes avoid smoke (0..10) */
  hazardAversion: number
  /** how strongly people avoid queues via live guidance (0..1) */
  congestionAwareness: number
  /** seconds between route reassessments (dynamic guidance) */
  reassessInterval: number
}

export interface Hotspot { x: number; y: number; area: string; seconds: number }

export interface Metrics {
  total: number
  evacuated: number
  remaining: number
  incapacitated: number
  evacuationTime: number
  t90: number
  meanEgress: number
  totalExposure: number
  meanExposure: number
  peakDensity: number
  congestionIndex: number
  exitUsage: Record<ExitId, number>
  hotspots: Hotspot[]
  curve: number[]
  tMax: number
  complete: boolean
}
