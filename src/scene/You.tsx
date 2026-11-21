import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { AgentState, type Simulation } from '../sim/simulation'
import { useRift } from '../state/store'
import { gx, gz } from './coords'

const MAROON = new THREE.Color('#500000')
const OVERCOME = new THREE.Color('#f0524f')

/** A pin, ring and light beam that follow the person you chose to be. */
export function YouMarker({ sim }: { sim: Simulation }) {
  const you = useRift(s => s.you)
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const pin = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g || you === null || you >= sim.n) return
    const st = sim.state[you]
    g.visible = st !== AgentState.Exited
    g.position.set(gx(sim.px[you]), 0, gz(sim.py[you]))
    const k = (clock.elapsedTime * 1.4) % 1
    ring.current?.scale.setScalar(0.6 + k * 1.2)
    ;(ring.current?.material as THREE.MeshBasicMaterial | undefined)?.setValues({ opacity: 0.9 * (1 - k) })
    pin.current?.color.copy(st === AgentState.Incapacitated ? OVERCOME : MAROON)
  })
  if (you === null) return null
  return (
    <group ref={group} renderOrder={30}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.38, 0.5, 40]} />
        <meshBasicMaterial color="#ffffff" transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.1, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.05, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.26, 0.55, 4]} />
        <meshBasicMaterial ref={pin} color={MAROON} toneMapped={false} />
      </mesh>
    </group>
  )
}
