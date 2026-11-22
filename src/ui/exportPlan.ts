import { jsPDF } from 'jspdf'
import { DT, Simulation } from '../sim/simulation'
import { scenarioOf, useRift } from '../state/store'
import { impactOf } from './impactStats'

const MAROON: [number, number, number] = [80, 0, 0]
const ROUTE: [number, number, number] = [200, 16, 46]
const EXIT: [number, number, number] = [0, 132, 61]

/** Nemotron's committed plan as a posted-style evacuation plan (letter, landscape), downloaded as a PDF. */
export function exportNemotronPlan() {
  const s = useRift.getState()
  const d = s.decision, base = s.baseline
  if (!d || !base) return
  const scenario = scenarioOf(s)
  const L = scenario.layout
  if (!L) return

  // routes people actually take under the plan, a few seconds after the alarm
  const sim = new Simulation(scenario, s.mods, d.strategy)
  while (sim.t < 10 && !sim.done) sim.step(DT)
  const routes = sim.routes().sort((a, b) => b.share - a.share)
  const youStart = s.you !== null ? new Simulation(scenario, s.mods, d.strategy) : null

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const PW = 279.4, PH = 215.9, M = 10
  // header band
  pdf.setFillColor(...MAROON); pdf.rect(0, 0, PW, 22, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20)
  pdf.text('EMERGENCY EVACUATION PLAN', M, 14)
  pdf.setFontSize(12)
  const where = `${s.building ?? L.name}${s.building ? `  ·  Floor ${s.floor}` : ''}`
  pdf.text(where, PW - M, 10, { align: 'right' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text('Routes planned and tested by NVIDIA Nemotron in RIFT', PW - M, 16, { align: 'right' })

  // floor plan
  const mapX = M, mapY = 28, mapW = 182, mapH = PH - mapY - 22
  const W = sim.world.width, H = sim.world.height
  const k = Math.min(mapW / W, mapH / H)
  const ox = mapX + (mapW - W * k) / 2, oy = mapY + (mapH - H * k) / 2
  const X = (gx: number) => ox + gx * k, Y = (gy: number) => oy + gy * k
  pdf.setFillColor(242, 242, 242)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sim.world.passable[y * W + x]) pdf.rect(X(x), Y(y), k, k, 'F')
  pdf.setFillColor(25, 25, 25)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sim.world.solid[y * W + x] === 1) pdf.rect(X(x), Y(y), k + 0.05, k + 0.05, 'F')
  // room names
  pdf.setTextColor(120, 120, 120); pdf.setFontSize(6)
  for (const z of L.zones) {
    if (/corridor/i.test(z.name)) continue
    const [x0, y0, x1, y1] = z.rect
    pdf.text(z.name, X((x0 + x1 + 1) / 2), Y((y0 + y1 + 1) / 2), { align: 'center', baseline: 'middle' })
  }
  // routes: the main route from each room solid, others dashed, arrowhead at the exit
  const seen = new Set<number>()
  for (const r of routes) {
    if (r.points.length < 2) continue
    const primary = !seen.has(r.zone)
    seen.add(r.zone)
    pdf.setDrawColor(...ROUTE); pdf.setLineWidth(primary ? 0.9 : 0.5)
    pdf.setLineDashPattern(primary ? [] : [1.5, 1.2], 0)
    for (let i = 1; i < r.points.length; i++) pdf.line(X(r.points[i - 1][0]), Y(r.points[i - 1][1]), X(r.points[i][0]), Y(r.points[i][1]))
    const [ax, ay] = r.points[r.points.length - 2], [bx, by] = r.points[r.points.length - 1]
    const ang = Math.atan2(by - ay, bx - ax), hx = X(bx), hy = Y(by), sz = primary ? 2.6 : 1.8
    pdf.setFillColor(...ROUTE)
    pdf.triangle(hx, hy, hx - sz * Math.cos(ang - 0.45), hy - sz * Math.sin(ang - 0.45), hx - sz * Math.cos(ang + 0.45), hy - sz * Math.sin(ang + 0.45), 'F')
  }
  pdf.setLineDashPattern([], 0)
  // exits
  for (const e of sim.world.exits) {
    const cx = e.cells.reduce((a, c) => a + c[0], 0) / e.cells.length, cy = e.cells.reduce((a, c) => a + c[1], 0) / e.cells.length
    pdf.setFillColor(...EXIT)
    for (const [x, y] of e.cells) pdf.rect(X(x), Y(y), k, k, 'F')
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold')
    const label = `EXIT · ${e.name}`
    const tw = pdf.getTextWidth(label) + 3
    pdf.roundedRect(X(cx + 0.5) - tw / 2, Y(cy + 0.5) - 6.5, tw, 4.2, 0.8, 0.8, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text(label, X(cx + 0.5), Y(cy + 0.5) - 3.6, { align: 'center' })
  }
  // you are here (where the reader chose to be when the alarm sounded)
  if (youStart && s.you !== null) {
    const [yx, yy] = [youStart.px[s.you], youStart.py[s.you]]
    pdf.setFillColor(...MAROON); pdf.circle(X(yx), Y(yy), 2, 'F')
    pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.5); pdf.circle(X(yx), Y(yy), 2, 'S')
    pdf.setTextColor(...MAROON); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8)
    pdf.text('YOU ARE HERE', X(yx) + 3, Y(yy) + 1)
  }
  pdf.setDrawColor(180, 180, 180); pdf.setLineWidth(0.3); pdf.rect(mapX, mapY, mapW, mapH, 'S')

  // side panel
  const sx = mapX + mapW + 8, sw = PW - sx - M
  let y = mapY + 2
  const heading = (t: string) => { pdf.setTextColor(...MAROON); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(t, sx, y); y += 5 }
  const para = (t: string, size = 8) => { pdf.setTextColor(30, 30, 30); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); const lines = pdf.splitTextToSize(t, sw) as string[]; pdf.text(lines, sx, y); y += lines.length * size * 0.42 + 1.5 }

  heading('LEGEND')
  pdf.setDrawColor(...ROUTE); pdf.setLineWidth(0.9); pdf.line(sx, y - 1, sx + 10, y - 1); para('            Primary route')
  pdf.setLineWidth(0.5); pdf.setLineDashPattern([1.5, 1.2], 0); pdf.line(sx, y - 1, sx + 10, y - 1); pdf.setLineDashPattern([], 0); para('            Secondary route')
  pdf.setFillColor(...EXIT); pdf.rect(sx, y - 3, 10, 3, 'F'); para('            Exit or stairwell')
  pdf.setFillColor(...MAROON); pdf.circle(sx + 5, y - 1.5, 1.5, 'F'); para('            You are here')
  y += 2
  heading('IN CASE OF FIRE')
  for (const t of ['1. Pull the nearest fire alarm and call 911.', '2. Leave now by the route marked for your room. Do not stop for belongings.', '3. Follow announcements and wardens; they may send you to a different exit than usual.', '4. Avoid smoke: stay low and take the other route if yours is blocked.', '5. Never use elevators. Use the stairwells marked EXIT.', '6. Go to the assembly area and stay clear of the building until told it is safe.']) para(t)
  y += 2
  heading("WHAT THIS PLAN CHANGES")
  const imp = impactOf(base, d.metrics, d.strategy, L)
  for (const c of imp.changes.slice(0, 4)) para(`• ${c}`)
  y += 2
  heading('TESTED IN SIMULATION')
  for (const st of imp.stats) para(`${st.label}: ${Math.round(st.before)}${st.unit} today → ${Math.round(st.after)}${st.unit} with this plan (${st.text})`)

  // footer
  pdf.setTextColor(110, 110, 110); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  pdf.text(`Generated ${new Date().toLocaleDateString()} by RIFT (tidalBYTE '26, Texas A&M). Plan ${d.provider === 'fallback' ? 'from the offline fallback planner' : 'by NVIDIA Nemotron'}, measured in a simplified simulation. Building outline and doors from Texas A&M Facilities GIS; the interior layout is schematic. Not a certified safety plan.`, M, PH - 8, { maxWidth: PW - 2 * M })

  const slug = `${s.building ?? L.name}-floor-${s.floor}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  pdf.save(`evacuation-plan-${slug}.pdf`)
}
