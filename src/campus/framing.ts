import type { Pt } from './plan'

/** The twin's opening shot after a campus hand-off: straight down from this height, with this vertical FOV. */
export const TWIN_INTRO_HEIGHT = 44
export const TWIN_FOV = 42
// the importer letterboxes the drawing into 62×38 cells of 0.5 m
const FIT_W = 31, FIT_H = 19

export interface Rect { x: number; y: number; w: number; h: number }
export interface OrientedBox { long: number; short: number; center: Pt }
export interface Pose { pos: [number, number, number]; target: [number, number, number] }

/** Twin units per real metre for a footprint of this size (the plan is scaled to fit, never stretched). */
export const twinUnitsPerMetre = (long: number, short: number) => Math.min(FIT_W / long, FIT_H / short)

/** Extent of a footprint along its long axis (`angle`, map x/z) and across it, and that box's centre. */
export function orientedBox(pts: Pt[], angle: number): OrientedBox {
  const c = Math.cos(angle), s = Math.sin(angle)
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
  for (const [x, z] of pts) {
    const a = x * c + z * s, b = -x * s + z * c
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b)
  }
  const ma = (a0 + a1) / 2, mb = (b0 + b1) / 2
  return { long: a1 - a0, short: b1 - b0, center: [ma * c - mb * s, ma * s + mb * c] }
}

/**
 * Overhead campus-camera pose that draws the building's roof exactly where, and exactly as big as, the twin's
 * opening shot will draw its floor plan inside `stage`, so the crossfade between the two lines up.
 */
export function matchTwinPose(box: OrientedBox, angle: number, roofY: number, canvas: { w: number; h: number }, stage: Rect, mapFov: number): Pose {
  const twinView = 2 * TWIN_INTRO_HEIGHT * Math.tan((TWIN_FOV * Math.PI) / 360) // world units across the stage height
  const tm = Math.tan((mapFov * Math.PI) / 360)
  const k = twinUnitsPerMetre(box.long, box.short)
  const dist = (canvas.h * twinView) / (2 * tm * k * stage.h) // camera height above the roof
  const perPx = (2 * dist * tm) / canvas.h
  const dx = stage.x + stage.w / 2 - canvas.w / 2, dy = stage.y + stage.h / 2 - canvas.h / 2
  const right: Pt = [Math.cos(angle), Math.sin(angle)], down: Pt = [-Math.sin(angle), Math.cos(angle)]
  // move the camera opposite to where the building should appear on screen
  const tx = box.center[0] - (right[0] * dx + down[0] * dy) * perPx
  const tz = box.center[1] - (right[1] * dx + down[1] * dy) * perPx
  const y = roofY + dist, nudge = y * 0.002 // a hair south of overhead so screen-up stays along −down
  return { pos: [tx + down[0] * nudge, y, tz + down[1] * nudge], target: [tx, 0, tz] }
}
