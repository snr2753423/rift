import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { matchTwinPose, orientedBox, TWIN_FOV, TWIN_INTRO_HEIGHT, twinUnitsPerMetre } from '../framing'
import type { Pt } from '../plan'

const MAP_FOV = 35

function project(p: THREE.Vector3, pos: THREE.Vector3, target: THREE.Vector3, fov: number, w: number, h: number): [number, number] {
  const cam = new THREE.PerspectiveCamera(fov, w / h, 1, 10000)
  cam.position.copy(pos)
  cam.lookAt(target)
  cam.updateMatrixWorld()
  const v = p.clone().project(cam)
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]
}

describe('orientedBox', () => {
  it('measures a rotated rectangle along its own axes', () => {
    const a = 0.5
    const r = (x: number, z: number): Pt => [100 + x * Math.cos(a) - z * Math.sin(a), 40 + x * Math.sin(a) + z * Math.cos(a)]
    const box = orientedBox([r(-30, -10), r(30, -10), r(30, 10), r(-30, 10)], a)
    expect(box.long).toBeCloseTo(60)
    expect(box.short).toBeCloseTo(20)
    expect(box.center[0]).toBeCloseTo(100)
    expect(box.center[1]).toBeCloseTo(40)
  })
})

describe('matchTwinPose', () => {
  const canvas = { w: 1440, h: 900 }
  const stage = { x: 12, y: 68, w: 1044, h: 650 }

  for (const angle of [0, 0.7, -1.2]) {
    it(`puts the roof where and as big as the twin draws the plan (angle ${angle})`, () => {
      const box = { long: 120, short: 50, center: [300, -80] as Pt }
      const roofY = 30
      const pose = matchTwinPose(box, angle, roofY, canvas, stage, MAP_FOV)
      const pos = new THREE.Vector3(...pose.pos), target = new THREE.Vector3(...pose.target)
      const right = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
      const c = new THREE.Vector3(box.center[0], roofY, box.center[1])
      const half = right.clone().multiplyScalar(box.long / 2)
      const [cx, cy] = project(c, pos, target, MAP_FOV, canvas.w, canvas.h)
      const [lx, ly] = project(c.clone().sub(half), pos, target, MAP_FOV, canvas.w, canvas.h)
      const [rx, ry] = project(c.clone().add(half), pos, target, MAP_FOV, canvas.w, canvas.h)

      // the twin's opening shot of the same footprint, inside the stage
      const k = twinUnitsPerMetre(box.long, box.short)
      const tPos = new THREE.Vector3(0, TWIN_INTRO_HEIGHT, 0.01), tTarget = new THREE.Vector3()
      const [tl] = project(new THREE.Vector3((-box.long * k) / 2, 0, 0), tPos, tTarget, TWIN_FOV, stage.w, stage.h)
      const [tr] = project(new THREE.Vector3((box.long * k) / 2, 0, 0), tPos, tTarget, TWIN_FOV, stage.w, stage.h)

      expect(cx).toBeCloseTo(stage.x + stage.w / 2, 0)
      expect(cy).toBeCloseTo(stage.y + stage.h / 2, 0)
      expect(Math.abs(ly - ry)).toBeLessThan(1) // long axis runs across the screen
      expect(rx - lx).toBeGreaterThan(0) // not mirrored
      expect(rx - lx).toBeCloseTo(tr - tl, 0)
    })
  }
})
