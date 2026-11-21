import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { Simulation } from '../sim/simulation'
import { gx, gz } from './coords'

type Route = ReturnType<Simulation['routes']>[number]

function Ribbon({ route, color }: { route: Route; color: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null)
  useFrame((_, dt) => { if (ref.current?.material) ref.current.material.dashOffset -= dt * 1.6 })
  const pts = route.points.filter((_, i, a) => i % 2 === 0 || i === a.length - 1).map(([x, y]) => [gx(x), 0.09, gz(y)] as [number, number, number])
  return <Line ref={ref} points={pts} color={color} lineWidth={1.5 + route.share * 3} dashed dashSize={0.55} gapSize={0.35} transparent opacity={0.35 + route.share * 0.6} toneMapped={false} />
}

export function Routes({ sim, color }: { sim: Simulation; color: string }) {
  const [routes, setRoutes] = useState<Route[]>(() => sim.routes())
  useEffect(() => {
    setRoutes(sim.routes())
    const id = setInterval(() => setRoutes(sim.routes()), 900)
    return () => clearInterval(id)
  }, [sim])
  return <group>{routes.map((r, i) => <Ribbon key={`${r.zone}-${r.exit}-${i}`} route={r} color={color} />)}</group>
}
