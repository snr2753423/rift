import { useEffect, useRef, useState } from 'react'
import { OFFICE_LAYOUT } from '../sim/layout'
import { scenarioOf, useRift } from '../state/store'
import { impactOf } from './impactStats'

const still = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts a figure up from zero once, so the result lands as a moment (rests at once under reduced motion). */
function Count({ to, ms = 900 }: { to: number; ms?: number }) {
  const [v, setV] = useState(() => (still() ? to : 0))
  useEffect(() => {
    if (still()) { setV(to); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setV(to * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{Math.round(v)}</>
}

/**
 * The moment the plan lands: what Nemotron changed for the people in this building, in measured numbers,
 * before the side-by-side replay. Re-opened from the stage at any time.
 */
export function Impact() {
  const decision = useRift(s => s.decision)
  const baseline = useRift(s => s.baseline)
  const runs = useRift(s => s.runs.length)
  const calls = useRift(s => s.events.filter(e => e.kind === 'tool_call').length)
  const layout = useRift(s => scenarioOf(s).layout ?? OFFICE_LAYOUT)
  const building = useRift(s => s.building)
  const [open, setOpen] = useState(false)
  const seen = useRef<unknown>(null)
  const close = useRef<HTMLButtonElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => { if (wasOpen.current && !open) pill.current?.focus(); wasOpen.current = open }, [open])
  useEffect(() => { if (decision && decision !== seen.current) { seen.current = decision; setOpen(true) } }, [decision])
  useEffect(() => { if (open) close.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'Tab') { e.preventDefault(); close.current?.focus() } // the dialog's one control keeps focus
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!decision || !baseline) return null
  const fallback = decision.provider === 'fallback'
  const im = impactOf(baseline, decision.metrics, decision.strategy, layout)
  if (!open) return <button ref={pill} className="impact-pill" onClick={() => setOpen(true)}><span className="nv-dot" />{fallback ? 'Fallback plan: see the impact' : 'See Nemotron’s impact'}</button>
  const lives = im.stats[0]
  const familiar = layout.exits.find(e => e.familiar)?.name
  return (
    <div className="impact-scrim" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <section className="impact" role="dialog" aria-modal="true" aria-labelledby="impact-h">
        <span className="impact-tag">{fallback ? 'Offline fallback planner · real simulations' : 'NVIDIA Nemotron · tested, not guessed'}</span>
        <h2 id="impact-h">{im.headline}</h2>
        <p className="impact-sub">
          {fallback ? 'The scripted fallback' : 'Nemotron'} ran <b><Count to={runs} ms={600} /></b> full evacuations of {building ?? 'this floor'} through <b>{calls}</b> tool calls and kept the safest. A real fire drill tests one plan, once a year.
        </p>
        <div className={`impact-hero ${im.livesSaved > 0 ? 'saved' : ''}`}>
          <div className="big num">{im.livesSaved > 0 ? <><Count to={im.livesSaved} /><small>{im.livesSaved === 1 ? 'life saved' : 'lives saved'}</small></> : <><Count to={decision.metrics.evacuated} /><small>of {decision.metrics.total} got out</small></>}</div>
          <p>{lives.before > 0
            ? <>Today’s procedure loses <b>{lives.before}</b> {lives.before === 1 ? 'person' : 'people'}{familiar ? <> as everyone heads for {familiar}, beside the fire</> : ' to the fire and smoke'}. Nemotron’s plan loses <b>{lives.after}</b>.</>
            : <>No one is lost under either plan here, so Nemotron went after speed, smoke and crowding instead.</>}</p>
        </div>
        <ul className="impact-stats">
          {im.stats.slice(1).map((s, i) => (
            <li key={s.key} className={s.better ? 'better' : s.text === 'Same' ? '' : 'worse'} style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span>{s.label}</span>
              <b className="num">{s.text}</b>
            </li>
          ))}
        </ul>
        {im.changes.length > 0 && (
          <div className="impact-changes">
            <h3>What the plan changes</h3>
            <ul>{im.changes.map((c, i) => <li key={i} style={{ animationDelay: `${300 + i * 70}ms` }}>{c}</li>)}</ul>
          </div>
        )}
        <p className="impact-fine">Measured in RIFT’s simulation of this floor (same fire, same people, deterministic). A model for comparing plans, not a certified safety prediction.</p>
        <button ref={close} className="btn nvidia" onClick={() => setOpen(false)}>Watch both plans side by side</button>
      </section>
    </div>
  )
}
