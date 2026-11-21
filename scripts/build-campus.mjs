// Turns an Overpass API export of Texas A&M's main campus into public/campus.json.
// Usage: node scripts/build-campus.mjs <overpass.json>
// Query used (bbox 30.6030,-96.3530,30.6255,-96.3320):
//   way/relation["building"], way["highway"~"primary|secondary|tertiary|residential|unclassified|service|pedestrian|footway"],
//   node["entrance"]; out body; >; out skel qt;
// Map data © OpenStreetMap contributors, ODbL.
import fs from 'node:fs'

const src = process.argv[2]
if (!src) { console.error('usage: node scripts/build-campus.mjs <overpass.json>'); process.exit(1) }
const d = JSON.parse(fs.readFileSync(src, 'utf8'))

const CENTER = [30.6150, -96.3410] // Academic Building area
const R = 6371000, rad = Math.PI / 180
// local metres: x east, z south (so a top-down view reads like a north-up map)
const project = n => [+(((n.lon - CENTER[1]) * rad * R * Math.cos(CENTER[0] * rad))).toFixed(1), +((-(n.lat - CENTER[0]) * rad * R)).toFixed(1)]

const nodes = new Map(), ways = new Map()
for (const e of d.elements) if (e.type === 'node' && !nodes.get(e.id)?.tags) nodes.set(e.id, e) // keep the tagged copy; Overpass repeats nodes untagged
for (const e of d.elements) if (e.type === 'way') ways.set(e.id, e)
const isEntrance = id => Boolean(nodes.get(id)?.tags?.entrance)

const flat = ids => ids.map(id => nodes.get(id)).filter(Boolean).flatMap(project)
const height = t => {
  if (t.height && !Number.isNaN(parseFloat(t.height))) return Math.min(60, parseFloat(t.height))
  if (t['building:levels']) return Math.min(60, parseFloat(t['building:levels']) * 3.6 || 7)
  return t.name ? 9 : 6
}

/** Join a relation's outer ways end to end and keep the largest closed ring. */
function outerRing(rel) {
  const segs = rel.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => ways.get(m.ref)?.nodes).filter(Boolean).map(n => [...n])
  const rings = []
  while (segs.length) {
    let ring = segs.shift()
    for (let guard = 0; ring[0] !== ring[ring.length - 1] && guard < 200; guard++) {
      const end = ring[ring.length - 1]
      const i = segs.findIndex(s => s[0] === end || s[s.length - 1] === end)
      if (i < 0) break
      const s = segs.splice(i, 1)[0]
      ring = ring.concat((s[0] === end ? s : s.reverse()).slice(1))
    }
    rings.push(ring)
  }
  return rings.sort((a, b) => b.length - a.length)[0] ?? []
}

const buildings = []
const add = (ids, tags) => {
  if (ids.length < 4) return
  const b = { h: +height(tags).toFixed(1), p: flat(ids) }
  if (tags.name) b.n = tags.name
  const ent = ids.filter(isEntrance).map(id => project(nodes.get(id)))
  if (ent.length) b.e = ent
  buildings.push(b)
}
for (const w of ways.values()) if (w.tags?.building) add(w.nodes, w.tags)
for (const r of d.elements) if (r.type === 'relation' && r.tags?.building) add(outerRing(r), r.tags)

const KIND = { primary: 'major', secondary: 'major', tertiary: 'major', residential: 'minor', unclassified: 'minor', service: 'minor', pedestrian: 'path', footway: 'path' }
const roads = []
for (const w of ways.values()) {
  const k = KIND[w.tags?.highway]
  if (k && !w.tags.area) roads.push({ k, p: flat(w.nodes) })
}

const out = { attribution: '© OpenStreetMap contributors (ODbL)', center: CENTER, buildings, roads }
fs.writeFileSync(new URL('../public/campus.json', import.meta.url), JSON.stringify(out))
console.log(`${buildings.length} buildings (${buildings.filter(b => b.n).length} named, ${buildings.filter(b => b.e).length} with entrances), ${roads.length} roads`)
