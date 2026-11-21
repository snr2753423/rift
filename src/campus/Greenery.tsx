import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { pointInPolygon, toPoints, type Pt } from './plan'

export interface GreenData { green?: { k: 'grass' | 'pitch'; p: number[] }[]; trees?: number[] }

const MAX_TREES = 2600
const SPACING = 15 // metres between decorative trees on a lawn

/** Seeded scatter of decorative trees on lawns (not on sports pitches), plus every tree mapped in OpenStreetMap. */
export function treeSpots(data: GreenData): Pt[] {
  const spots: Pt[] = []
  for (let i = 0; i + 1 < (data.trees?.length ?? 0); i += 2) spots.push([data.trees![i], data.trees![i + 1]])
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const g of data.green ?? []) {
    if (g.k !== 'grass') continue
    const poly = toPoints(g.p)
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1])
    for (let x = Math.min(...xs); x < Math.max(...xs); x += SPACING) for (let z = Math.min(...zs); z < Math.max(...zs); z += SPACING) {
      const p: Pt = [x + (rnd() - 0.5) * SPACING * 0.8, z + (rnd() - 0.5) * SPACING * 0.8]
      if (rnd() < 0.55 && pointInPolygon(p, poly)) spots.push(p)
      if (spots.length >= MAX_TREES) return spots
    }
  }
  return spots
}

function Lawns({ data }: { data: GreenData }) {
  const geos = useMemo(() => (['grass', 'pitch'] as const).map(k => {
    const parts = (data.green ?? []).filter(g => g.k === k).map(g => {
      const shape = new THREE.Shape(toPoints(g.p).map(([x, z]) => new THREE.Vector2(x, -z)))
      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(-Math.PI / 2)
      return geo
    })
    const merged = parts.length ? mergeGeometries(parts) : null
    parts.forEach(p => p.dispose())
    return { k, geo: merged }
  }), [data])
  useEffect(() => () => geos.forEach(g => g.geo?.dispose()), [geos])
  const color = { grass: '#14231a', pitch: '#18301d' }
  return <>{geos.map(({ k, geo }) => geo && (
    <mesh key={k} geometry={geo} position-y={k === 'pitch' ? 0.12 : 0.08} raycast={() => null}>
      <meshStandardMaterial color={color[k]} roughness={1} />
    </mesh>
  ))}</>
}

function Trees({ data }: { data: GreenData }) {
  const spots = useMemo(() => treeSpots(data), [data])
  const { crown, trunk } = useMemo(() => {
    const crown = new THREE.IcosahedronGeometry(1, 0)
    const trunk = new THREE.CylinderGeometry(0.18, 0.25, 1, 5)
    return { crown, trunk }
  }, [])
  const meshes = useMemo(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color()
    const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), spots.length)
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#2b211a', roughness: 1 }), spots.length)
    spots.forEach(([x, z], i) => {
      const h = 6 + ((i * 37) % 7) // 6–12 m live oaks
      const r = h * 0.42
      m.compose(new THREE.Vector3(x, h * 0.62, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(r, r * 0.8, r))
      crowns.setMatrixAt(i, m)
      crowns.setColorAt(i, c.setHSL(0.3 + ((i * 13) % 10) * 0.004, 0.32, 0.14 + ((i * 7) % 10) * 0.006))
      m.compose(new THREE.Vector3(x, h * 0.25, z), q.identity(), new THREE.Vector3(1, h * 0.5, 1))
      trunks.setMatrixAt(i, m)
    })
    crowns.raycast = () => null
    trunks.raycast = () => null
    return { crowns, trunks }
  }, [spots, crown, trunk])
  useEffect(() => () => {
    meshes.crowns.dispose(); meshes.trunks.dispose()
    ;(meshes.crowns.material as THREE.Material).dispose(); (meshes.trunks.material as THREE.Material).dispose()
  }, [meshes])
  useEffect(() => () => { crown.dispose(); trunk.dispose() }, [crown, trunk])
  return <><primitive object={meshes.crowns} /><primitive object={meshes.trunks} /></>
}

/** Lawns, sports fields and trees: OpenStreetMap areas, mapped trees, and seeded decorative trees on lawns. */
export function Greenery({ data }: { data: GreenData }) {
  return <><Lawns data={data} /><Trees data={data} /></>
}
