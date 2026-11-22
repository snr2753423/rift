// Pulls Texas A&M's own facilities data for the featured buildings into public/official.json:
// footprint, floor count and building entrances, from the university's public GIS service.
// Usage: node scripts/build-official.mjs
// Source: https://gis.tamu.edu/arcgis/rest/services (FCOR/TAMU_Basemap_20261008 layer 2, FCOR/ADA_120717 layer 0).
import fs from 'node:fs'

const BASE = 'https://gis.tamu.edu/arcgis/rest/services/FCOR'
// featured building (OpenStreetMap name) → Texas A&M building abbreviation
const ABBREV = {
  'Memorial Student Center': 'MSC', 'Zachry Engineering Education Complex': 'ZACH', 'Sterling C. Evans Library': 'LIBR',
  'Academic Building': 'ACAD', 'Innovative Learning Classroom Building': 'ILCB', 'Blocker Building': 'BLOC',
  'Duncan Dining Hall': 'DCAN', 'Student Recreation Center': 'SREC', 'Commons': 'COMM', 'Sbisa Dining Hall': 'SBSA',
  'Koldus Building': 'JJKB', 'Interdisciplinary Life Sciences Building': 'ILSB', 'Wehner Building': 'WCBA',
  'Rudder Tower': 'RDER', 'Aston Residence Hall': 'ASTO', 'Dunn Residence Hall': 'DUNN', 'Krueger Residence Hall': 'KRUE',
  'Mosher Residence Hall': 'MOSH', 'Hullabaloo Residence Hall': 'HLBL',
}

const CENTER = [30.6150, -96.3410] // same local frame as scripts/build-campus.mjs
const R = 6371000, rad = Math.PI / 180
const project = ([lon, lat]) => [+((lon - CENTER[1]) * rad * R * Math.cos(CENTER[0] * rad)).toFixed(1), +(-(lat - CENTER[0]) * rad * R).toFixed(1)]
const area = ring => Math.abs(ring.reduce((a, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return a + x1 * y2 - x2 * y1 }, 0) / 2)

async function query(service, layer, where, outFields) {
  const url = `${BASE}/${service}/MapServer/${layer}/query?${new URLSearchParams({ where, outFields, returnGeometry: 'true', outSR: '4326', f: 'json' })}`
  const r = await fetch(url, { headers: { 'User-Agent': 'rift-campus-builder' } })
  if (!r.ok) throw new Error(`${service} ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(`${service}: ${j.error.message}`)
  return j.features
}

const list = Object.values(ABBREV).map(a => `'${a}'`).join(',')
const buildings = await query('TAMU_Basemap_20261008', 2, `BldgAbbrev IN (${list})`, 'BldgAbbrev,BldgName,NumFloors')
const doors = await query('ADA_120717', 0, `BldgAbbrev IN (${list})`, 'BldgAbbrev,Category')

const out = { source: 'Texas A&M Facilities GIS (gis.tamu.edu), public map services', buildings: {} }
for (const [name, abbrev] of Object.entries(ABBREV)) {
  const parts = buildings.filter(f => f.attributes.BldgAbbrev?.trim() === abbrev)
  const rings = parts.flatMap(f => f.geometry?.rings ?? [])
  if (!rings.length) { console.warn(`no footprint for ${abbrev}`); continue }
  const outer = rings.map(r => r.map(project)).sort((a, b) => area(b) - area(a))[0]
  const floors = Math.max(...parts.map(f => Number(f.attributes.NumFloors) || 0)) || null
  const entrances = doors.filter(f => f.attributes.BldgAbbrev?.trim() === abbrev && f.geometry).map(f => project([f.geometry.x, f.geometry.y]))
  out.buildings[name] = { abbrev, floors, footprint: outer.flat(), entrances }
}
fs.writeFileSync(new URL('../public/official.json', import.meta.url), JSON.stringify(out))
for (const [n, b] of Object.entries(out.buildings)) console.log(b.abbrev.padEnd(5), `${b.floors} fl`, `${b.footprint.length / 2} pts`, `${b.entrances.length} doors`, n)
