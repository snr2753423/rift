import { useEffect, useState } from 'react'
import { DT, Simulation } from '../sim/simulation'
import { baselineFor } from '../sim/strategy'
import { scenarioOf, useRift } from './store'

/** Live (rendered) simulations, stepped in lockstep with a fixed timestep so they match headless runs exactly. */
export const live: { baseline: Simulation | null; ai: Simulation | null } = { baseline: null, ai: null }

function rebuild() {
  const s = useRift.getState()
  const sc = scenarioOf(s)
  live.baseline = new Simulation(sc, s.mods, baselineFor(sc.layout))
  live.ai = s.decision ? new Simulation(sc, s.mods, s.decision.strategy) : null
  queueMicrotask(() => useRift.setState(st => ({ simGen: st.simGen + 1 })))
}

let acc = 0
let last = 0
let holdUntil = 0
let started = false
export function startDriver() {
  if (started) return
  started = true
  rebuild()
  let key = ''
  useRift.subscribe(s => {
    const k = `${s.epoch}|${s.scenarioId}|${s.customScenario?.id ?? ''}|${s.mods.length}|${s.decision?.strategy.name ?? ''}|${s.decision?.metrics.evacuationTime ?? ''}`
    if (k !== key) { key = k; rebuild(); acc = 0 }
  })
  const loop = (now: number) => {
    const s = useRift.getState()
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    const finished = (live.baseline?.done ?? true) && (live.ai?.done ?? true)
    if (finished && s.playing && s.drill === 'running') useRift.setState({ playing: false, drill: 'done' })
    else if (finished && s.playing) {
      holdUntil ||= now + 3500
      if (now > holdUntil) { holdUntil = 0; rebuild() } // auto-replay keeps the twin alive between runs
    }
    if (s.playing && !finished) {
      acc += dt * s.speed
      let steps = 0
      while (acc >= DT && steps < 60) {
        live.baseline?.step(DT)
        live.ai?.step(DT)
        acc -= DT
        steps++
      }
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

/** Re-render a HUD component at a modest rate. */
export function useTicker(hz = 6) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN(n => n + 1), 1000 / hz)
    return () => clearInterval(id)
  }, [hz])
}
