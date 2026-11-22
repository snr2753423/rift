import { create } from 'zustand'
import { loadCampus } from '../campus/data'

export type BootTask = 'data' | 'map' | 'nemotron' | 'fonts'
export type TaskState = 'wait' | 'ok' | 'warn'

interface Boot {
  tasks: Record<BootTask, TaskState>
  /** the loader has lifted; the campus intro flight waits for this */
  revealed: boolean
  mark: (t: BootTask, s?: TaskState) => void
  reveal: () => void
}

export const useBoot = create<Boot>(set => ({
  tasks: { data: 'wait', map: 'wait', nemotron: 'wait', fonts: 'wait' },
  revealed: false,
  mark: (t, s = 'ok') => set(b => (b.tasks[t] === 'wait' ? { tasks: { ...b.tasks, [t]: s } } : b)),
  reveal: () => set({ revealed: true }),
}))

let started = false
/** Real work the loading screen waits on. The map marks 'map' itself once its first frames are drawn. */
export function startBoot() {
  if (started) return
  started = true
  const { mark } = useBoot.getState()
  loadCampus().then(() => mark('data'), () => mark('data', 'warn'))
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts) fonts.ready.then(() => mark('fonts'), () => mark('fonts', 'warn'))
  else mark('fonts')
  // a GET only reports whether the server holds a key; it never spends tokens
  fetch('/api/chat', { signal: AbortSignal.timeout(6000) })
    .then(r => r.json())
    .then(j => mark('nemotron', j?.data?.configured ? 'ok' : 'warn'), () => mark('nemotron', 'warn'))
}
