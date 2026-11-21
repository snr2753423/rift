import { runFallbackAgent, runNemotronAgent, type AgentInput } from '../agent/loop'
import { simulate } from '../agent/simClient'
import { baselineFor } from '../sim/strategy'
import type { Metrics, Modification } from '../sim/types'
import { scenarioOf, useRift } from './store'

let baselineToken = 0
/** Headless baseline for the current environment (exact final metrics for comparison cards). */
export async function computeBaseline(): Promise<Metrics | null> {
  const token = ++baselineToken
  const s = useRift.getState()
  useRift.setState({ baselineBusy: true })
  try {
    const sc = scenarioOf(s)
    const { metrics } = await simulate(sc, s.mods, baselineFor(sc.layout))
    if (token !== baselineToken) return null
    useRift.setState({ baseline: metrics, baselineBusy: false })
    return metrics
  } catch (e) {
    console.error('baseline simulation failed', e)
    useRift.setState({ baselineBusy: false })
    return null
  }
}

let abort: AbortController | null = null

export async function engageAgent(replanChange?: Modification) {
  const st = useRift.getState()
  if (st.agentStatus === 'running') return
  const ac = new AbortController()
  abort = ac
  useRift.setState({ agentStatus: 'running', events: [], runs: [] })
  const push = useRift.getState().pushEvent
  const scenario = scenarioOf(st)
  const modsAtStart = useRift.getState().mods
  const stale = () => ac.signal.aborted || scenarioOf(useRift.getState()) !== scenario
  const fail = (text: string) => { push({ kind: 'error', text }); useRift.setState({ agentStatus: 'error' }) }

  let outcome
  try {
    const baseline = (await computeBaseline()) ?? useRift.getState().baseline
    if (!baseline) return fail('Baseline simulation failed.')
    let replan: AgentInput['replan']
    const prev = useRift.getState().decision
    if (replanChange && prev) {
      push({ kind: 'status', text: 'Environment changed — re-testing the committed strategy under new conditions…' })
      const { metrics } = await simulate(scenario, modsAtStart, prev.strategy)
      replan = { change: replanChange, previous: { strategy: prev.strategy, metricsNow: metrics } }
      push({ kind: 'tool_result', text: 'retest_committed_strategy', tool: 'retest_committed_strategy', result: { strategy: prev.strategy.name, evacuation_time_s: metrics.evacuationTime, t90_s: metrics.t90, incapacitated: metrics.incapacitated } })
    }
    const input: AgentInput = {
      scenario,
      mods: modsAtStart,
      baseline,
      replan,
      onEvent: e => (stale() ? undefined : useRift.getState().pushEvent(e)),
      onPatch: (id, p) => { if (!stale()) useRift.getState().patchEvent(id, p) },
      onRun: r => { if (!stale()) useRift.getState().addRun(r) },
      signal: ac.signal,
    }
    try {
      const health = await fetch('/api/chat').then(r => r.json()).catch(() => null)
      if (!health?.data?.configured) throw new Error('NVIDIA_API_KEY is not configured on the server')
      useRift.setState({ provider: 'nemotron' })
      outcome = await runNemotronAgent(input)
    } catch (e) {
      if (stale()) return
      push({ kind: 'error', text: `Live Nemotron run did not complete (${e instanceof Error ? e.message : String(e)}). Switching to the labeled demo fallback.` })
      useRift.setState({ provider: 'fallback', runs: [] })
      outcome = await runFallbackAgent(input)
    }
  } catch (err) {
    if (!stale()) fail(`Agent failed: ${err instanceof Error ? err.message : String(err)}`)
    return
  } finally {
    if (abort === ac) abort = null
    if (stale() && useRift.getState().agentStatus === 'running') useRift.setState({ agentStatus: 'idle' })
  }
  if (stale()) return
  push({ kind: 'decision', text: outcome.headline, result: { rationale: outcome.rationale, changes: outcome.changes, run: outcome.run.id } })
  useRift.setState({
    agentStatus: 'done',
    provider: outcome.provider,
    decision: { provider: outcome.provider, strategy: outcome.run.strategy, metrics: outcome.run.metrics, headline: outcome.headline, rationale: outcome.rationale, changes: outcome.changes },
    playing: true,
  })
  useRift.getState().restart()
  // the environment changed while the agent was working: replan once more against the latest state
  const nowMods = useRift.getState().mods
  if (nowMods !== modsAtStart && nowMods.length > modsAtStart.length) void engageAgent(nowMods[nowMods.length - 1])
}

export function cancelAgent() { abort?.abort() }

let wired = false
/** Recompute the baseline on any environment change; autonomously replan when a committed strategy exists. */
export function wireAutomation() {
  const st = useRift.getState()
  if (!st.baseline && !st.baselineBusy) void computeBaseline()
  if (wired) return
  wired = true
  let lastScenario = scenarioOf(useRift.getState())
  let lastMods = useRift.getState().mods.length
  useRift.subscribe(s => {
    if (scenarioOf(s) !== lastScenario) { cancelAgent(); lastScenario = scenarioOf(s); lastMods = s.mods.length; void computeBaseline(); return }
    if (s.mods.length !== lastMods) {
      const added = s.mods.length > lastMods ? s.mods[s.mods.length - 1] : undefined
      lastMods = s.mods.length
      if (added && s.decision && s.agentStatus !== 'running') void engageAgent(added)
      else void computeBaseline()
    }
  })
}
