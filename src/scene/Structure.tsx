import { Grid, Html } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CELL } from '../sim/layout'
import type { Simulation } from '../sim/simulation'
import type { World } from '../sim/types'
import { useTicker } from '../state/live'
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

function ExitMarker({ sim, index }: { sim: Simulation; index: number }) {
  useTicker(4)
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
      <Html position={[0, 3.1, 0]} center distanceFactor={22} zIndexRange={[10, 0]}>
        <div className={`exit-tag ${e.blocked ? 'blocked' : ''}`}>
          <span>{e.name}</span>
          <b>{e.blocked ? 'BLOCKED' : sim.exitCount[index]}</b>
        </div>
      </Html>
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
