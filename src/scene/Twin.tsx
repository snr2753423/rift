import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { CELL } from '../sim/layout'
import type { Simulation } from '../sim/simulation'
import { useRift } from '../state/store'
import { toCell } from './coords'
import { Crowd } from './Crowd'
import { Fire, HeatmapLayer, Smoke } from './Hazards'
import { modFromClick } from './mods'
import { Routes } from './Routes'
import { Structure } from './Structure'

const PRESETS = {
  iso: new THREE.Vector3(0, 25, 23),
  top: new THREE.Vector3(0, 34, 0.01),
  low: new THREE.Vector3(-17, 7, 15),
}

function CameraRig({ compact }: { compact: boolean }) {
  const preset = useRift(s => s.cameraPreset)
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as unknown as OrbitImpl | null
  const target = useRef(new THREE.Vector3())
  useEffect(() => {
    target.current.copy(PRESETS[preset]).multiplyScalar(compact ? 1.62 : 1)
    const from = camera.position.clone()
    let k = 0, raf = 0
    const tick = () => {
      k = Math.min(1, k + 0.035)
      const e = 1 - Math.pow(1 - k, 3)
      camera.position.lerpVectors(from, target.current, e)
      controls?.target.set(0, 0, 0)
      controls?.update()
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [preset, camera, controls, compact])
  return null
}

function PickPlane({ sim }: { sim: Simulation }) {
  const tool = useRift(s => s.tool)
  const addMod = useRift(s => s.addMod)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (tool === 'orbit' || e.delta > 5) return
    e.stopPropagation()
    const m = modFromClick(tool, toCell(e.point.x, e.point.z), sim.world)
    if (m) addMod(m)
  }
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} onClick={onClick} visible={false}>
      <planeGeometry args={[sim.world.width * CELL + 2, sim.world.height * CELL + 2]} />
      <meshBasicMaterial />
    </mesh>
  )
}

export function Twin({ sim, routeColor, crowdTint, compact = false }: { sim: Simulation; routeColor: string; crowdTint?: string; compact?: boolean }) {
  const heatmap = useRift(s => s.heatmap)
  const showRoutes = useRift(s => s.showRoutes)
  const tool = useRift(s => s.tool)
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.25]}
      camera={{ position: PRESETS.iso.clone().multiplyScalar(compact ? 1.62 : 1), fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ cursor: tool === 'orbit' ? 'grab' : 'crosshair' }}
    >
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 38, 85]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#9fd8ff', '#0a0d12', 0.55]} />
      <directionalLight position={[10, 20, 8]} intensity={0.9} color="#cfe8ff" />
      <Structure sim={sim} />
      <HeatmapLayer sim={sim} mode={heatmap} />
      {showRoutes && <Routes sim={sim} color={routeColor} />}
      <Crowd sim={sim} tint={crowdTint} />
      <Fire sim={sim} />
      <Smoke sim={sim} />
      <PickPlane sim={sim} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={1.38} minDistance={10} maxDistance={70} />
      <CameraRig compact={compact} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.62} luminanceSmoothing={0.2} intensity={1.15} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  )
}
