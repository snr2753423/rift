import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CELL } from '../sim/layout'
import { VOID } from '../import/segment'
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
    const value = e.blocked ? 'BLOCKED' : String(n)
    g.font = '600 44px "IBM Plex Mono", ui-monospace, monospace'
    const valueW = g.measureText(value).width
    // shrink the name to fit beside the counter, never overlapping it
    const room = 488 - valueW - 24 - 26
    let size = 40
    g.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`
    while (size > 22 && g.measureText(e.name).width > room) { size -= 2; g.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace` }
    let label = e.name
    while (label.length > 3 && g.measureText(label).width > room) label = `${label.slice(0, -2)}…`
    g.fillStyle = e.blocked ? '#ffc2c8' : '#cff7df'
    g.textBaseline = 'middle'
    g.fillText(label, 26, 57)
    g.font = '600 44px "IBM Plex Mono", ui-monospace, monospace'
    g.fillStyle = accent
    g.textAlign = 'right'
    g.fillText(value, 488, 57)
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

/** Floor drawn only where the building is: grid lines baked into a texture, outside cells transparent. */
function Floor({ world }: { world: World }) {
  const tex = useMemo(() => {
    const S = 16, c = document.createElement('canvas')
    c.width = world.width * S; c.height = world.height * S
    const g = c.getContext('2d')!
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      if (world.solid[y * world.width + x] === VOID) continue
      g.fillStyle = (x % 5 === 0 || y % 5 === 0) ? '#1f3a4d' : '#16202b'
      g.fillRect(x * S, y * S, S, S)
      g.fillStyle = '#0b1016'
      g.fillRect(x * S + (x % 5 === 0 ? 1.5 : 1), y * S + (y % 5 === 0 ? 1.5 : 1), S - 1, S - 1)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [world])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
      <planeGeometry args={[world.width * CELL, world.height * CELL]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.5} roughness={0.9} metalness={0.1} />
    </mesh>
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
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[width + 14, depth + 14]} />
        <meshStandardMaterial color="#06080b" roughness={1} />
      </mesh>
      <Floor world={world} />
      <Blocks cells={walls} h={WALL_H} color="#18212c" />
      <Blocks cells={walls} h={0.02} y={WALL_H} color="#6fe3ff" emissive="#3fbfe6" emissiveIntensity={0.75} />
      <Blocks cells={furniture} h={0.42} color="#263241" />
      <Blocks cells={debris} h={0.9} color="#ff8a3d" emissive="#ff6a00" emissiveIntensity={0.5} />
      {world.exits.map((_, i) => <ExitMarker key={i} sim={sim} index={i} />)}
    </group>
  )
}
