import { Grid } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CELL } from '../sim/layout'
import type { Simulation } from '../sim/simulation'
import type { World } from '../sim/types'
import { gx, gz } from './coords'

const WALL_H = 1.25
const m4 = new THREE.Matrix4()

function cellsOf(world: World, kind: number) {
  const out: [number, number][] = []
  for (let i = 0; i < world.solid.length; i++) if (world.solid[i] === kind) out.push([i % world.width, (i / world.width) | 0])
  return out
}

function Blocks({ cells, h, color, emissive, emissiveIntensity = 0, y = 0 }: { cells: [number, number][]; h: number; color: string; emissive?: string; emissiveIntensity?: number; y?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    cells.forEach(([x, z], i) => { m4.makeTranslation(gx(x + 0.5), y + h / 2, gz(z + 0.5)); mesh.setMatrixAt(i, m4) })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [cells, h, y])
  if (!cells.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} castShadow receiveShadow key={cells.length}>
      <boxGeometry args={[CELL, h, CELL]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.25} emissive={emissive ?? '#000'} emissiveIntensity={emissiveIntensity} toneMapped={!emissive} />
    </instancedMesh>
  )
}

/** Exit label drawn to a canvas texture (pure WebGL — no DOM portals). Redrawn only when the count changes. */
function ExitLabel({ sim, index, y }: { sim: Simulation; index: number; y: number }) {
  const e = sim.world.exits[index]
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 112
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { canvas, tex }
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  const last = useRef(-1)
  useFrame(() => {
    const n = e.blocked ? -2 : sim.exitCount[index]
    if (n === last.current) return
    last.current = n
    const g = canvas.getContext('2d')!
    const accent = e.blocked ? '#ff4d5e' : '#3ddc84'
    g.clearRect(0, 0, 512, 112)
    g.fillStyle = 'rgba(5,10,8,0.86)'
    g.strokeStyle = accent
    g.lineWidth = 4
    g.beginPath(); g.roundRect(4, 4, 504, 104, 18); g.fill(); g.stroke()
    g.font = '500 40px "IBM Plex Mono", ui-monospace, monospace'
    g.fillStyle = e.blocked ? '#ffc2c8' : '#cff7df'
    g.textBaseline = 'middle'
    g.fillText(e.name, 26, 57)
    g.font = '600 44px "IBM Plex Mono", ui-monospace, monospace'
    g.fillStyle = accent
    g.textAlign = 'right'
    g.fillText(e.blocked ? 'BLOCKED' : String(n), 488, 57)
    g.textAlign = 'left'
    tex.needsUpdate = true
  })
  return (
    <sprite position={[0, y, 0]} scale={[4.4, 0.96, 1]} renderOrder={20}>
      <spriteMaterial map={tex} transparent depthTest={false} toneMapped={false} />
    </sprite>
  )
}

function ExitMarker({ sim, index }: { sim: Simulation; index: number }) {
  const e = sim.world.exits[index]
  const xs = e.cells.map(c => c[0]), ys = e.cells.map(c => c[1])
  const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2
  const horizontal = new Set(ys).size === 1
  const len = e.cells.length * CELL
  const color = e.blocked ? '#ff4d5e' : '#3ddc84'
  return (
    <group position={[gx(cx), 0, gz(cy)]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={horizontal ? [len, 2.8, 0.06] : [0.06, 2.8, len]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={horizontal ? [len, 0.05, 0.5] : [0.5, 0.05, len]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <ExitLabel sim={sim} index={index} y={3.3} />
    </group>
  )
}

export function Structure({ sim }: { sim: Simulation }) {
  const world = sim.world
  const walls = useMemo(() => cellsOf(world, 1), [world])
  const furniture = useMemo(() => cellsOf(world, 2), [world])
  const debris = useMemo(() => cellsOf(world, 3), [world])
  const width = world.width * CELL, depth = world.height * CELL
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[width + 6, depth + 6]} />
        <meshStandardMaterial color="#0a0e13" roughness={0.9} metalness={0.1} />
      </mesh>
      <Grid position={[0, 0.004, 0]} args={[width, depth]} cellSize={CELL} cellThickness={0.5} cellColor="#16202b" sectionSize={CELL * 5} sectionThickness={0.9} sectionColor="#1f3a4d" fadeDistance={80} fadeStrength={1} />
      <Blocks cells={walls} h={WALL_H} color="#18212c" />
      <Blocks cells={walls} h={0.02} y={WALL_H} color="#6fe3ff" emissive="#3fbfe6" emissiveIntensity={0.75} />
      <Blocks cells={furniture} h={0.42} color="#263241" />
      <Blocks cells={debris} h={0.9} color="#ff8a3d" emissive="#ff6a00" emissiveIntensity={0.5} />
      {world.exits.map((_, i) => <ExitMarker key={i} sim={sim} index={i} />)}
    </group>
  )
}
