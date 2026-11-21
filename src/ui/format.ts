export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const fmtNum = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—')
export function delta(base: number, v: number) {
  if (!base) return { pct: 0, label: '±0%' }
  const pct = ((v - base) / base) * 100
  return { pct, label: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` }
}
