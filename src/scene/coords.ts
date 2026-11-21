import { CELL, H, W } from '../sim/layout'
/** grid (cell units) → world metres, centred on origin; grid y maps to world z */
export const gx = (x: number) => (x - W / 2) * CELL
export const gz = (y: number) => (y - H / 2) * CELL
export const toCell = (wx: number, wz: number): [number, number] => [Math.floor(wx / CELL + W / 2), Math.floor(wz / CELL + H / 2)]
