// Adds lawns, parks and trees to public/campus.json from an Overpass API export.
// Usage: node scripts/build-green.mjs <overpass-green.json>
// Query used (same bbox as build-campus.mjs):
//   node["natural"="tree"], way["leisure"~"park|garden|pitch"], way["landuse"~"grass|recreation_ground|meadow"];
//   out body; >; out skel qt;
// Map data © OpenStreetMap contributors, ODbL.
import fs from 'node:fs'

const src = process.argv[2]
if (!src) { console.error('usage: node scripts/build-green.mjs <overpass.json>'); process.exit(1) }
const d = JSON.parse(fs.readFileSync(src, 'utf8'))
const out = new URL('../public/campus.json', import.meta.url)
const campus = JSON.parse(fs.readFileSync(out, 'utf8'))

const [lat0, lon0] = campus.center
const R = 6371000, rad = Math.PI / 180
const project = n => [+(((n.lon - lon0) * rad * R * Math.cos(lat0 * rad))).toFixed(1), +((-(n.lat - lat0) * rad * R)).toFixed(1)]

const nodes = new Map()
for (const e of d.elements) if (e.type === 'node') nodes.set(e.id, e)

const green = []
for (const w of d.elements) {
  if (w.type !== 'way' || !w.tags) continue
  const pts = w.nodes.map(id => nodes.get(id)).filter(Boolean)
  if (pts.length < 4 || w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue
  green.push({ k: w.tags.leisure === 'pitch' ? 'pitch' : 'grass', p: pts.flatMap(project) })
}
const trees = d.elements.filter(e => e.type === 'node' && e.tags?.natural === 'tree').flatMap(project)

fs.writeFileSync(out, JSON.stringify({ ...campus, green, trees }))
console.log(`${green.length} green areas, ${trees.length / 2} mapped trees`)
