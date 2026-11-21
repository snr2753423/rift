import { create } from 'zustand'
import type { AgentEvent, Provider } from '../agent/loop'
import type { RunRecord } from '../agent/tools'
import { SCENARIOS, type ScenarioId } from '../sim/scenarios'
import type { Metrics, Modification, Scenario, Strategy } from '../sim/types'

export type ToolMode = 'orbit' | 'fire' | 'obstacle' | 'block'
export type Heatmap = 'off' | 'density' | 'smoke' | 'danger'
export type AgentStatus = 'idle' | 'running' | 'done' | 'error'

export interface Decision {
  provider: Provider
  strategy: Strategy
  metrics: Metrics
  headline: string
  rationale: string
  changes: string[]
}

export interface ImportInfo { imageUrl: string; notes: string[]; provider: 'nemotron-vl' | 'heuristic' }

interface State {
  scenarioId: ScenarioId | 'imported'
  customScenario: Scenario | null
  importInfo: ImportInfo | null
  mods: Modification[]
  /** bumping restarts live playback */
  epoch: number
  playing: boolean
  speed: number
  tool: ToolMode
  heatmap: Heatmap
  showRoutes: boolean
  baseline: Metrics | null
  baselineBusy: boolean
  decision: Decision | null
  /** committed AI strategy re-simulated under current mods (null until available) */
  agentStatus: AgentStatus
  provider: Provider | null
  events: AgentEvent[]
  runs: RunRecord[]
  cameraPreset: 'iso' | 'top' | 'low'
  simGen: number
  setScenario: (id: ScenarioId) => void
  loadCustom: (sc: Scenario, info: ImportInfo) => void
  addMod: (m: Modification) => void
  clearMods: () => void
  restart: () => void
  set: (p: Partial<State>) => void
  pushEvent: (e: Omit<AgentEvent, 'id'>) => number
  patchEvent: (id: number, p: Partial<AgentEvent>) => void
  addRun: (r: RunRecord) => void
  resetAgent: () => void
}

let eventSeq = 0

export const useRift = create<State>((set) => ({
  scenarioId: 'kitchen_fire',
  customScenario: null,
  importInfo: null,
  mods: [],
  epoch: 0,
  playing: true,
  speed: 3,
  tool: 'orbit',
  heatmap: 'off',
  showRoutes: true,
  baseline: null,
  baselineBusy: false,
  decision: null,
  agentStatus: 'idle',
  provider: null,
  events: [],
  runs: [],
  cameraPreset: 'iso',
  simGen: 0,
  setScenario: (id) => set(s => ({ scenarioId: id, mods: [], epoch: s.epoch + 1, decision: null, events: [], runs: [], agentStatus: 'idle', provider: null, baseline: null, playing: true })),
  loadCustom: (sc, info) => set(s => ({ scenarioId: 'imported', customScenario: sc, importInfo: info, mods: [], epoch: s.epoch + 1, decision: null, events: [], runs: [], agentStatus: 'idle', provider: null, baseline: null, playing: true })),
  addMod: (m) => set(s => ({ mods: [...s.mods, m], epoch: s.epoch + 1, playing: true })),
  clearMods: () => set(s => ({ mods: [], epoch: s.epoch + 1 })),
  restart: () => set(s => ({ epoch: s.epoch + 1, playing: true })),
  set: (p) => set(p),
  pushEvent: (e) => { const id = ++eventSeq; set(s => ({ events: [...s.events, { ...e, id }] })); return id },
  patchEvent: (id, p) => set(s => ({ events: s.events.map(ev => (ev.id === id ? { ...ev, ...p } : ev)) })),
  addRun: (r) => set(s => ({ runs: [...s.runs, r] })),
  resetAgent: () => set({ events: [], runs: [] }),
}))

/** The active scenario: a built-in one or an imported floor plan. */
export function scenarioOf(s: { scenarioId: ScenarioId | 'imported'; customScenario: Scenario | null }): Scenario {
  return s.scenarioId === 'imported' && s.customScenario ? s.customScenario : SCENARIOS[s.scenarioId === 'imported' ? 'kitchen_fire' : s.scenarioId]
}
