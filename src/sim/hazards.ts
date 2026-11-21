import type { Scenario, World } from './types'

/**
 * Simplified cellular hazard model (not CFD):
 * fire grows per cell and ignites walkable neighbours stochastically;
 * smoke is emitted by fire, diffuses through open cells, decays slowly and vents at exits.
 */
export class HazardField {
  readonly fire: Float32Array
  smoke: Float32Array
  private next: Float32Array
  private pending: { i: number; t: number }[]

  constructor(private world: World, private scenario: Scenario, private rand: () => number) {
    const n = world.width * world.height
    this.fire = new Float32Array(n)
    this.smoke = new Float32Array(n)
    this.next = new Float32Array(n)
    this.pending = [...scenario.ignitions, ...world.extraIgnitions].map(ig => ({ i: ig.cell[1] * world.width + ig.cell[0], t: ig.t }))
  }

  private flammable(i: number) {
    return this.world.passable[i] === 1 && this.world.isExit[i] === 0
  }

  step(dt: number, t: number) {
    const { width: w, height: h } = this.world
    const { fire, smoke, next } = this
    this.pending = this.pending.filter(p => {
      if (p.t > t) return true
      if (this.world.solid[p.i] !== 1) fire[p.i] = Math.max(fire[p.i], 0.35)
      return false
    })
    const spread = this.scenario.fireSpreadPerSec * dt
    const n = w * h
    for (let i = 0; i < n; i++) {
      const f = fire[i]
      if (f <= 0) continue
      fire[i] = Math.min(1, f + 0.08 * dt)
      if (f < 0.5) continue
      const x = i % w, y = (i / w) | 0
      if (x > 1 && fire[i - 1] === 0 && this.flammable(i - 1) && this.rand() < spread) fire[i - 1] = 0.05
      if (x < w - 2 && fire[i + 1] === 0 && this.flammable(i + 1) && this.rand() < spread) fire[i + 1] = 0.05
      if (y > 1 && fire[i - w] === 0 && this.flammable(i - w) && this.rand() < spread) fire[i - w] = 0.05
      if (y < h - 2 && fire[i + w] === 0 && this.flammable(i + w) && this.rand() < spread) fire[i + w] = 0.05
    }
    const D = Math.min(0.24, 1.2 * dt)
    const yieldRate = this.scenario.smokeYield * dt
    const decay = 1 - 0.004 * dt
    for (let i = 0; i < n; i++) {
      if (!this.world.passable[i] && fire[i] === 0) { next[i] = 0; continue }
      const x = i % w, y = (i / w) | 0
      let sum = 0, cnt = 0
      const c = smoke[i]
      if (x > 0 && (this.world.passable[i - 1] || fire[i - 1])) { sum += smoke[i - 1]; cnt++ }
      if (x < w - 1 && (this.world.passable[i + 1] || fire[i + 1])) { sum += smoke[i + 1]; cnt++ }
      if (y > 0 && (this.world.passable[i - w] || fire[i - w])) { sum += smoke[i - w]; cnt++ }
      if (y < h - 1 && (this.world.passable[i + w] || fire[i + w])) { sum += smoke[i + w]; cnt++ }
      let v = c + (cnt ? D * (sum - cnt * c) / 4 : 0)
      v = v * decay + fire[i] * yieldRate
      if (this.world.isExit[i]) v *= 1 - Math.min(1, 2 * dt)
      next[i] = v < 0 ? 0 : v > 1 ? 1 : v
    }
    this.next = smoke
    this.smoke = next
  }
}
