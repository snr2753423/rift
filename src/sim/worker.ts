/// <reference lib="webworker" />
import { runHeadless } from './simulation'
import type { Modification, Scenario, Strategy } from './types'

self.onmessage = (e: MessageEvent<{ id: number; scenario: Scenario; mods: Modification[]; strategy: Strategy }>) => {
  const { id, scenario, mods, strategy } = e.data
  try {
    const t0 = performance.now()
    const metrics = runHeadless(scenario, mods, strategy)
    self.postMessage({ id, metrics, ms: Math.round(performance.now() - t0) })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
