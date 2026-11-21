import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { AgentState, type Simulation } from '../sim/simulation'
import { gx, gz } from './coords'

const o = new THREE.Object3D()
const c = new THREE.Color()
const CALM = new THREE.Color('#e9e4d8')
const WAIT = new THREE.Color('#6b6e76')
const WARN = new THREE.Color('#f5a524').multiplyScalar(1.2)
const HURT = new THREE.Color('#f0524f').multiplyScalar(1.4)

export function Crowd({ sim, tint }: { sim: Simulation; tint?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const head = useRef<THREE.InstancedMesh>(null)
  const calm = tint ? new THREE.Color(tint).multiplyScalar(0.95) : CALM
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    for (let i = 0; i < sim.n; i++) {
      const st = sim.state[i]
      if (st === AgentState.Exited) { o.position.set(0, -50, 0); o.scale.setScalar(0.0001); o.rotation.set(0, 0, 0) }
      else if (st === AgentState.Incapacitated) {
        o.position.set(gx(sim.px[i]), 0.12, gz(sim.py[i])); o.rotation.set(Math.PI / 2, 0, (i % 7) * 0.4); o.scale.setScalar(1)
      } else {
        const bob = st === AgentState.Moving ? Math.abs(Math.sin(t * 9 + i)) * 0.05 : 0
        o.position.set(gx(sim.px[i]), 0.42 + bob, gz(sim.py[i])); o.rotation.set(0, 0, 0); o.scale.setScalar(1)
      }
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      head.current?.setMatrixAt(i, o.matrix)
      if (st === AgentState.Incapacitated) c.copy(HURT)
      else if (st === AgentState.Waiting) c.copy(WAIT)
      else {
        const k = Math.min(1, sim.exposure[i] / 30)
        c.copy(calm).lerp(WARN, Math.min(1, k * 1.6))
        if (k > 0.6) c.lerp(HURT, (k - 0.6) / 0.4)
      }
      mesh.setColorAt(i, c)
      head.current?.setColorAt(i, c)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (head.current) { head.current.instanceMatrix.needsUpdate = true; if (head.current.instanceColor) head.current.instanceColor.needsUpdate = true }
  })
  // a body and a head per person, sharing one transform
  return (
    <group key={sim.n}>
      <instancedMesh ref={ref} args={[undefined, undefined, sim.n]} frustumCulled={false}>
        <capsuleGeometry args={[0.15, 0.4, 4, 10]} />
        <meshStandardMaterial roughness={0.6} emissiveIntensity={0.25} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, sim.n]} frustumCulled={false}>
        <sphereGeometry args={[0.12, 12, 10]} onUpdate={g => g.translate(0, 0.52, 0)} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </group>
  )
}
