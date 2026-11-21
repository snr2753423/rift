import { useRift } from '../state/store'

/** Floating status while the agent works, so it's always clear what NVIDIA Nemotron is doing. */
export function NemotronPill() {
  const status = useRift(s => s.agentStatus)
  const provider = useRift(s => s.provider)
  const runs = useRift(s => s.runs.length)
  const last = useRift(s => s.events[s.events.length - 1])
  if (status !== 'running') return null
  const offline = provider === 'fallback'
  const doing = last?.kind === 'thought' && last.streaming ? 'reasoning about the bottlenecks'
    : last?.kind === 'tool_call' && last.tool === 'run_simulation' ? 'running an evacuation simulation'
    : last?.kind === 'tool_call' && last.tool === 'analyze_bottlenecks' ? 'finding where people get stuck'
    : 'planning'
  return (
    <div className={`nv-pill ${offline ? 'offline' : ''}`} role="status">
      <span className="nv-dot" />
      <b>{offline ? 'Offline fallback' : 'NVIDIA Nemotron'}</b>
      <span>{doing}{runs ? ` · ${runs} simulation${runs > 1 ? 's' : ''} so far` : ''}</span>
    </div>
  )
}
