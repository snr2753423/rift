import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import type { CampusData, Spot } from './data'
import { useBoot } from '../ui/boot'
import { matchTwinPose, orientedBox, type Rect } from './framing'
import { Greenery } from './Greenery'
import { withWindows } from './windows'
import { toPoints } from './plan'

const HEIGHT_SCALE = 1 // true scale: OpenStreetMap heights (or levels × 3.6 m) as built
const FOV = 35
const FLOOR_H = 3.6 * HEIGHT_SCALE // one storey, as drawn
// aimed left of centre so the campus sits beside the landing story, not under it
const OVERVIEW = { pos: new THREE.Vector3(20, 1250, 1500), target: new THREE.Vector3(-500, 0, 120) }
const INTRO_FROM = new THREE.Vector3(520, 2600, 2700)

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function extrude(flat: number[], h: number): THREE.BufferGeometry | null {
  if (flat.length < 6) return null
  const shape = new THREE.Shape()
  shape.moveTo(flat[0], -flat[1])
  for (let i = 2; i < flat.length; i += 2) shape.lineTo(flat[i], -flat[i + 1])
  const g = new THREE.ExtrudeGeometry(shape, { depth: h * HEIGHT_SCALE, bevelEnabled: false })
  g.rotateX(-Math.PI / 2) // shape (x, −z) extruded along +y
  return g
}

/** Where the twin's stage will sit on screen: measured once it is mounted, estimated from the layout before that. */
function stageRect(w: number, h: number): Rect {
  const el = document.querySelector('.stage')
  const r = el?.getBoundingClientRect()
  if (r && r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height }
  if (w <= 900) return { x: 16, y: 64, w: w - 32, h: h * 0.6 }
  const side = w <= 1280 ? 320 : 360
  return { x: 12, y: 68, w: w - 36 - side, h: h - 242 }
}

/** Camera pose straight above a building, with its roof exactly where the twin will draw the floor plan. */
export function closeUp(s: Spot, size: { width: number; height: number }, stage = stageRect(size.width, size.height)) {
  const box = orientedBox(toPoints(s.footprint), s.angle)
  const p = matchTwinPose(box, s.angle, s.height * HEIGHT_SCALE, { w: size.width, h: size.height }, stage, FOV)
  return { pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target) }
}

/** Re-aims the dive once the twin's stage is mounted, then stops measuring (no layout reads every frame). */
function retargetOnce(s: Spot, size: { width: number; height: number }) {
  let pose: ReturnType<typeof closeUp> | null = null
  return () => {
    if (pose) return pose
    const now = closeUp(s, size)
    if (document.querySelector('.stage')) pose = now
    return now
  }
}

/** A closer take on the overview, centred on one building: what you see after leaving its twin. */
function nearView(s: Spot) {
  const target = new THREE.Vector3(s.center[0], 0, s.center[1])
  return { pos: target.clone().add(OVERVIEW.pos.clone().sub(OVERVIEW.target).multiplyScalar(0.55)), target }
}

type Flight = { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; dur: number; done?: () => void; cross?: number; onCross?: () => void; retarget?: () => { pos: THREE.Vector3; target: THREE.Vector3 } } | null

/** Eases the camera and orbit target along one flight, then hands control back to OrbitControls. */
function Rig({ flight }: { flight: Flight }) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as unknown as OrbitImpl | null
  const st = useRef({ f: null as Flight, t0: 0, finished: true, crossed: false })
  useFrame(({ clock }) => {
    if (!flight || !controls) return
    if (st.current.f !== flight) st.current = { f: flight, t0: clock.elapsedTime, finished: false, crossed: false }
    if (st.current.finished) return
    const k = Math.min(1, (clock.elapsedTime - st.current.t0) / flight.dur), e = ease(k)
    if (flight.retarget) { const r = flight.retarget(); flight.to.copy(r.pos); flight.toT.copy(r.target) } // the stage mounts mid-flight
    camera.position.lerpVectors(flight.from, flight.to, e)
    controls.target.lerpVectors(flight.fromT, flight.toT, e)
    controls.update()
    if (flight.cross !== undefined && k >= flight.cross && !st.current.crossed) { st.current.crossed = true; flight.onCross?.() }
    if (k >= 1) { st.current.finished = true; flight.done?.() }
  })
  return null
}

function Roads({ data }: { data: CampusData }) {
  const groups = useMemo(() => (['major', 'minor', 'path'] as const).map(k => {
    const pos: number[] = []
    for (const r of data.roads) if (r.k === k) for (let i = 0; i + 3 < r.p.length; i += 2) pos.push(r.p[i], 0.3, r.p[i + 1], r.p[i + 2], 0.3, r.p[i + 3])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return { k, g }
  }), [data])
  useEffect(() => () => groups.forEach(x => x.g.dispose()), [groups])
  const color = { major: '#6a6e78', minor: '#3a3d44', path: '#30333a' }
  return <>{groups.map(({ k, g }) => <lineSegments key={k} geometry={g} raycast={() => null}><lineBasicMaterial color={color[k]} /></lineSegments>)}</>
}

function Context({ data, spots, dim }: { data: CampusData; spots: Spot[]; dim: number }) {
  const geo = useMemo(() => {
    const featured = new Set(spots.map(s => s.name))
    const parts = data.buildings.filter(b => !b.n || !featured.has(b.n)).map(b => extrude(b.p, b.h)).filter((g): g is THREE.BufferGeometry => g !== null)
    const merged = mergeGeometries(parts)
    parts.forEach(p => p.dispose())
    return merged
  }, [data, spots])
  useEffect(() => () => geo?.dispose(), [geo])
  const mat = useMemo(() => withWindows(new THREE.MeshStandardMaterial({ color: '#3c3f47', roughness: 0.95, transparent: true }), FLOOR_H, 0.22), [])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => { mat.opacity += ((1 - dim * 0.75) - mat.opacity) * 0.08 })
  if (!geo) return null
  return <mesh geometry={geo} material={mat} raycast={() => null} />
}

/** Keeps the DOM labels (owned by the overlay) pinned above their buildings. */
function LabelTracker({ spots, labels }: { spots: Spot[]; labels: Map<string, HTMLElement> }) {
  const camera = useThree(s => s.camera)
  const size = useThree(s => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const blockers = [...document.querySelectorAll('.campus-head:not(.hide) > *, .campus-list')].map(b => b.getBoundingClientRect())
    for (const s of spots) {
      const el = labels.get(s.name)
      if (!el) continue
      v.set(s.center[0], s.height * HEIGHT_SCALE + 6, s.center[1]).project(camera)
      const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height
      const w = el.offsetWidth, h = el.offsetHeight
      const covered = blockers.some(r => x + w / 2 > r.left && x - w / 2 < r.right && y > r.top && y - h < r.bottom)
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && !covered
      el.style.opacity = visible ? '1' : '0'
      el.style.pointerEvents = visible ? '' : 'none'
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
    }
  })
  return null
}

function Landmark({ spot, hovered, selected, busy, onHover, onPick }: { spot: Spot; hovered: boolean; selected: boolean; busy: boolean; onHover: (n: string | null) => void; onPick: (s: Spot) => void }) {
  const geo = useMemo(() => extrude(spot.footprint, spot.height), [spot])
  useEffect(() => () => geo?.dispose(), [geo])
  const lit = hovered || selected
  if (!geo) return null
  return (
    <group>
      <mesh
        geometry={geo}
        onPointerOver={e => { e.stopPropagation(); onHover(spot.name) }}
        onPointerOut={() => onHover(null)}
        onClick={e => { e.stopPropagation(); if (!busy) onPick(spot) }}
      >
        <meshStandardMaterial ref={m => { if (m && !m.customProgramCacheKey().startsWith('windows')) withWindows(m, FLOOR_H, 0.35) }} color={lit ? '#6e1a1a' : '#500000'} emissive={lit ? '#500000' : '#200000'} emissiveIntensity={lit ? 0.5 : 0.3} roughness={0.7} />
      </mesh>
    </group>
  )
}

export interface CampusMapProps {
  data: CampusData
  spots: Spot[]
  selected: Spot | null
  /** fly from this building's close-up back to the overview (returning from a twin) */
  returnFrom: Spot | null
  hovered: string | null
  /** label elements by building name, positioned every frame */
  labels: Map<string, HTMLElement>
  onHover: (n: string | null) => void
  onPick: (s: Spot) => void
  /** fired part-way down the dive, when the twin should start fading in */
  onCross: () => void
}

/** Tells the loading screen the campus has actually drawn (geometry built, shaders compiled). */
function ReadySignal() {
  const frames = useRef(0)
  useFrame(() => { if (++frames.current === 3) useBoot.getState().mark('map') })
  return null
}

function Scene({ data, spots, selected, returnFrom, hovered, labels, onHover, onPick, onCross }: CampusMapProps) {
  const camera = useThree(s => s.camera)
  const size = useThree(s => s.size)
  const [flight, setFlight] = useState<Flight>(null)
  const controls = useThree(s => s.controls) as unknown as OrbitImpl | null
  const [settled, setSettled] = useState(false)
  const [interacted, setInteracted] = useState(false)
  // entry: fly in from high above, or back out from the building we just left (runs once per mount).
  // the first fly-in waits for the loading screen to lift so nobody misses it
  useEffect(() => {
    const from = returnFrom ? closeUp(returnFrom, size) : { pos: INTRO_FROM, target: OVERVIEW.target }
    // coming back from a building: pull out only part way, still centred on it
    const to = returnFrom ? nearView(returnFrom) : { pos: OVERVIEW.pos, target: OVERVIEW.target }
    camera.position.copy(from.pos)
    const go = () => setFlight({ from: from.pos.clone(), to: to.pos.clone(), fromT: from.target.clone(), toT: to.target.clone(), dur: returnFrom ? 1.8 : 2.8, done: () => setSettled(true) })
    if (returnFrom || useBoot.getState().revealed) { go(); return }
    return useBoot.subscribe(b => { if (b.revealed) go() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return
    const to = closeUp(selected, size)
    const fromT = controls?.target.clone() ?? OVERVIEW.target.clone()
    setFlight({ from: camera.position.clone(), to: to.pos, fromT, toT: to.target, dur: 2.6, cross: 0.8, onCross, retarget: retargetOnce(selected, size) })
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <color attach="background" args={['#0a0a0b']} />
      <fog attach="fog" args={['#0a0a0b', 2200, 4200]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#e8eaf0', '#0a0a0b', 0.6]} />
      <directionalLight position={[600, 1200, 400]} intensity={1.1} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.2, 0]} raycast={() => null}>
        <planeGeometry args={[9000, 9000]} />
        <meshStandardMaterial color="#101012" roughness={1} />
      </mesh>
      <Greenery data={data} />
      <Roads data={data} />
      <Context data={data} spots={spots} dim={selected ? 1 : 0} />
      {spots.map(s => <Landmark key={s.name} spot={s} hovered={hovered === s.name} selected={selected?.name === s.name} busy={Boolean(selected)} onHover={onHover} onPick={onPick} />)}
      <OrbitControls
        makeDefault
        enabled={settled && !selected}
        enableDamping
        dampingFactor={0.08}
        autoRotate={settled && !interacted && !selected}
        autoRotateSpeed={0.25}
        maxPolarAngle={1.2}
        minDistance={180}
        maxDistance={3200}
        onStart={() => setInteracted(true)}
      />
      <Rig flight={flight} />
      <ReadySignal />
      <LabelTracker spots={spots} labels={labels} />
    </>
  )
}

export function CampusMap(props: CampusMapProps) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: INTRO_FROM.toArray(), fov: FOV, near: 5, far: 9000 }} gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ cursor: props.hovered ? 'pointer' : 'grab' }}>
      <Scene {...props} />
    </Canvas>
  )
}
