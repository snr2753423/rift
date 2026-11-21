import type { Cell, Modification, World } from '../sim/types'

/** Turn a click on the floor into an environment change. Corridor obstacles span the full corridor width. */
export function modFromClick(tool: 'fire' | 'obstacle' | 'block', [x, y]: [number, number], world: World): Modification | null {
  const W = world.width, H = world.height
  if (x < 0 || y < 0 || x >= W || y >= H) return null
  if (tool === 'block') {
    let best: { id: string; d: number } | null = null
    for (const e of world.exits) for (const [ex, ey] of e.cells) {
      const d = Math.hypot(ex - x, ey - y)
      if (d < 7 && (!best || d < best.d)) best = { id: e.id, d }
    }
    return best ? { kind: 'block_exit', exit: best.id } : null
  }
  if (!world.passable[y * W + x] || world.isExit[y * W + x]) return null
  if (tool === 'fire') return { kind: 'fire', cell: [x, y] }
  const cells: Cell[] = []
  const office = world.layout.corridors
  const inHCorridor = office && y >= 18 && y <= 21 && (x < 29 || x > 34)
  const inVCorridor = office && x >= 30 && x <= 33 && (y < 17 || y > 22)
  if (inHCorridor) for (let yy = 18; yy <= 21; yy++) for (const xx of [x, x + 1]) cells.push([xx, yy])
  else if (inVCorridor) for (let xx = 30; xx <= 33; xx++) for (const yy of [y, y + 1]) cells.push([xx, yy])
  else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push([x + dx, y + dy])
  return { kind: 'obstacle', cells, label: inHCorridor || inVCorridor ? 'collapsed ceiling' : 'debris' }
}
