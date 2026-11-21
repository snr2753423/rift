import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { TWIN_FOV, TWIN_INTRO_HEIGHT } from '../campus/framing'
import { CELL } from '../sim/layout'
import type { Simulation } from '../sim/simulation'
import { personInZone, zoneAt } from '../sim/outcome'
import { useRift } from '../state/store'
import { toCell } from './coords'
import { Crowd } from './Crowd'
import { Fire, HeatmapLayer, Smoke } from './Hazards'
import { modFromClick } from './mods'
import { Routes } from './Routes'
import { Structure } from './Structure'
import { YouMarker } from './You'

const PRESETS = {
  iso: new THREE.Vector3(0, 25, 23),
  top: new THREE.Vector3(0, 34, 0.01),
  low: new THREE.Vector3(-17, 7, 15),
}
/** compare mode: building rotated 90° so its long axis runs up the narrow viewport */
const COMPACT = {
  iso: new THREE.Vector3(0, 40, 25),
  top: new THREE.Vector3(0, 46, 0.01),
  low: new THREE.Vector3(-12, 10, 26),
}
const presetFor = (p: keyof typeof PRESETS, compact: boolean) => (compact ? COMPACT : PRESETS)[p]

const INTRO_FROM = new THREE.Vector3(0, TWIN_INTRO_HEIGHT, 0.01) // straight down, long axis across the screen, as the campus close-up left it
const INTRO_MS = 2400

/** Eases to the camera preset. After a campus hand-off it holds overhead until the crossfade starts, then keeps descending. */
function CameraRig({ compact, intro }: { compact: boolean; intro: boolean }) {
  const preset = useRift(s => s.cameraPreset)
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as unknown as OrbitImpl | null
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height))
  const target = useRef(new THREE.Vector3())
  useEffect(() => {
    // narrow (phone) viewports: back the camera off so the whole floor still fits across
    target.current.copy(presetFor(preset, compact)).multiplyScalar(compact ? 1 : Math.max(1, Math.min(1.8, 1.2 / aspect))) // compare presets are already framed for narrow views
    const from = camera.position.clone()
    let raf = 0, t0 = 0
    const tick = (now: number) => {
      const startAt = intro ? useRift.getState().enteredAt : 0
      if (intro && now < startAt) { raf = requestAnimationFrame(tick); return }
      t0 ||= now
      const k = Math.min(1, (now - t0) / (intro ? INTRO_MS : 600))
      // after a hand-off, start from rest so the descent picks up where the campus camera slows down
      const e = intro ? (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) : 1 - Math.pow(1 - k, 3)
      camera.position.lerpVectors(from, target.current, e)
      controls?.target.set(0, 0, 0)
      controls?.update()
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [preset, camera, controls, compact, intro, aspect])
  return null
}

function PickPlane({ sim }: { sim: Simulation }) {
  const tool = useRift(s => s.tool)
  const addMod = useRift(s => s.addMod)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return
    const local = e.eventObject.parent ? e.eventObject.parent.worldToLocal(e.point.clone()) : e.point
    const cell = toCell(local.x, local.z)
    const s = useRift.getState()
    if (tool === 'orbit') {
      // before the alarm, a click on the floor puts "you" there
      if (s.drill !== 'pick' && s.drill !== 'ready') return
      const zi = zoneAt(sim, cell)
      const who = zi >= 0 ? personInZone(sim, zi, cell) : -1
      if (who >= 0) { e.stopPropagation(); s.set({ you: who, youRoom: sim.world.zones[zi].name, drill: 'ready' }) }
      return
    }
    e.stopPropagation()
    const m = modFromClick(tool, cell, sim.world)
    if (m) addMod(m)
  }
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} onClick={onClick} visible={false}>
      <planeGeometry args={[sim.world.width * CELL + 2, sim.world.height * CELL + 2]} />
      <meshBasicMaterial />
    </mesh>
  )
}

export function Twin({ sim, routeColor, crowdTint, compact = false, intro = false }: { sim: Simulation; routeColor: string; crowdTint?: string; compact?: boolean; intro?: boolean }) {
  const heatmap = useRift(s => s.heatmap)
  const showRoutes = useRift(s => s.showRoutes)
  const tool = useRift(s => s.tool)
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.25]}
      camera={{ position: (intro ? INTRO_FROM : presetFor('iso', compact)).clone(), fov: TWIN_FOV, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ cursor: tool === 'orbit' ? 'grab' : 'crosshair' }}
    >
      <color attach="background" args={['#0a0a0b']} />
      <fog attach="fog" args={['#0a0a0b', 38, 85]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#e8eaf0', '#0a0a0b', 0.5]} />
      <directionalLight position={[10, 20, 8]} intensity={0.9} color="#ffffff" />
      <group rotation-y={compact ? Math.PI / 2 : 0}>
        <Structure sim={sim} />
        <HeatmapLayer sim={sim} mode={heatmap} />
        {showRoutes && <Routes sim={sim} color={routeColor} />}
        <Crowd sim={sim} tint={crowdTint} />
        <YouMarker sim={sim} />
        <Fire sim={sim} />
        <Smoke sim={sim} />
        <PickPlane sim={sim} />
      </group>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={1.38} minDistance={10} maxDistance={70} />
      <CameraRig compact={compact} intro={intro} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.2} intensity={0.6} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  )
}
