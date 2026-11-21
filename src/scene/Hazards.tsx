import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CELL } from '../sim/layout'
import type { Simulation } from '../sim/simulation'
import type { Heatmap } from '../state/store'
import { gx, gz } from './coords'

const MAX_FLAMES = 900
const o = new THREE.Object3D()
const c = new THREE.Color()
const HOT = new THREE.Color('#fff2a8').multiplyScalar(2.2)
const EMBER = new THREE.Color('#ff5a1f').multiplyScalar(1.8)

export function Fire({ sim }: { sim: Simulation }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    const fire = sim.hazards.fire, W = sim.world.width
    let k = 0, sx = 0, sz = 0
    for (let i = 0; i < fire.length && k < MAX_FLAMES; i++) {
      const f = fire[i]
      if (f <= 0) continue
      const x = i % W, y = (i / W) | 0
      const flick = 0.75 + 0.25 * Math.sin(t * 13 + i * 1.7) + 0.15 * Math.sin(t * 29 + i)
      const h = (0.25 + f * 1.5) * flick
      o.position.set(gx(x + 0.5), h / 2, gz(y + 0.5))
      o.scale.set(0.9 + f * 0.3, h, 0.9 + f * 0.3)
      o.rotation.set(0, t * 0.5 + i, 0)
      o.updateMatrix()
      mesh.setMatrixAt(k, o.matrix)
      c.copy(EMBER).lerp(HOT, Math.max(0, 1 - f) * 0.6 + 0.2 * flick)
      mesh.setColorAt(k, c)
      sx += gx(x + 0.5); sz += gz(y + 0.5); k++
    }
    mesh.count = k
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (light.current) {
      light.current.intensity = k ? (14 + Math.min(40, k * 0.6)) * (0.85 + 0.15 * Math.sin(t * 17)) : 0
      if (k) light.current.position.set(sx / k, 1.6, sz / k)
    }
  })
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, MAX_FLAMES]} frustumCulled={false}>
        <coneGeometry args={[0.3, 1, 7, 1, true]} />
        <meshBasicMaterial transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <pointLight ref={light} color="#ff7a2e" distance={14} decay={1.6} intensity={0} />
    </group>
  )
}

function useGridTexture(sim: Simulation) {
  return useMemo(() => {
    const { width: w, height: h } = sim.world
    const data = new Uint8Array(w * h * 4)
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.flipY = false
    tex.needsUpdate = true
    return { tex, data }
  }, [sim])
}

const smokeVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const smokeFrag = /* glsl */ `
uniform sampler2D map; uniform float time; uniform float layer; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  float s = texture2D(map, vec2(vUv.x, 1.0 - vUv.y)).r;
  float n = fbm(vUv * vec2(9.0, 6.0) + vec2(time * 0.06 * (1.0 + layer), -time * 0.04));
  float a = smoothstep(0.02, 0.9, s) * (0.35 + 0.75 * n) * (0.62 - layer * 0.11);
  vec3 col = mix(vec3(0.52,0.54,0.58), vec3(0.18,0.17,0.19), smoothstep(0.2, 1.0, s));
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}`

export function Smoke({ sim }: { sim: Simulation }) {
  const { tex, data } = useGridTexture(sim)
  const mats = useRef<THREE.ShaderMaterial[]>([])
  const layers = [0.6, 1.25, 1.9]
  const uniforms = useMemo(() => layers.map((_, l) => ({ map: { value: tex }, time: { value: 0 }, layer: { value: l } })), [tex]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => {
    const s = sim.hazards.smoke
    for (let i = 0; i < s.length; i++) data[i * 4] = Math.min(255, s[i] * 255 * 1.6)
    tex.needsUpdate = true
    for (const m of mats.current) if (m) m.uniforms.time.value = clock.elapsedTime
  })
  const w = sim.world.width * CELL, h = sim.world.height * CELL
  return (
    <group>
      {layers.map((y, l) => (
        <mesh key={l} rotation-x={-Math.PI / 2} position={[0, y, 0]} renderOrder={10 + l}>
          <planeGeometry args={[w, h]} />
          <shaderMaterial ref={m => { if (m) mats.current[l] = m }} vertexShader={smokeVert} fragmentShader={smokeFrag} uniforms={uniforms[l]} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Ramp 0..1 → safe teal → amber → red */
function ramp(t: number, out: number[]) {
  if (t < 0.5) { const k = t / 0.5; out[0] = 40 + 215 * k; out[1] = 220 - 40 * k; out[2] = 180 - 130 * k }
  else { const k = (t - 0.5) / 0.5; out[0] = 255; out[1] = 180 - 140 * k; out[2] = 50 + 20 * k }
}

export function HeatmapLayer({ sim, mode }: { sim: Simulation; mode: Heatmap }) {
  const { tex, data } = useGridTexture(sim)
  useMemo(() => { tex.repeat.set(1, -1); tex.offset.set(0, 1) }, [tex])
  const rgb = useMemo(() => [0, 0, 0], [])
  const frame = useRef(0)
  useFrame(() => {
    if (mode === 'off' || frame.current++ % 3) return
    const { density } = sim
    const { smoke, fire } = sim.hazards
    const pass = sim.world.passable
    for (let i = 0; i < smoke.length; i++) {
      let v = 0
      if (mode === 'density') v = Math.min(1, density[i] / 4)
      else if (mode === 'smoke') v = Math.min(1, smoke[i] * 1.4)
      else v = Math.min(1, Math.max(fire[i] > 0 ? 1 : 0, smoke[i] * 1.3, (density[i] - 1.8) / 3))
      if (!pass[i] && fire[i] === 0) v = 0
      ramp(v, rgb)
      if (mode === 'density') { rgb[0] = 80 + 175 * v; rgb[1] = 60 + 60 * (1 - v); rgb[2] = 255 - 80 * v }
      data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]
      data[i * 4 + 3] = v < 0.06 ? 0 : Math.min(205, 30 + v * 200)
    }
    tex.needsUpdate = true
  })
  if (mode === 'off') return null
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} renderOrder={2}>
      <planeGeometry args={[sim.world.width * CELL, sim.world.height * CELL]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
