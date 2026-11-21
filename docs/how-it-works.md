# How RIFT works

## From campus to twin

The site opens on Texas A&M's main campus, built from an OpenStreetMap export (`scripts/build-campus.mjs` turns it into `public/campus.json`: 800 footprints with heights, 2,299 roads and paths, and mapped entrances). `scripts/build-green.mjs` adds 162 lawns and sports fields and 65 mapped trees from a second export; the remaining trees on lawns are a seeded decorative scatter, and building facades get a window band per floor in a shader. Eight buildings are featured; picking one flies the camera down until the roof sits exactly where the twin will draw the floor plan (same screen rectangle, same size, `src/campus/framing.ts`), so the crossfade lines up.

Meanwhile `src/campus/plan.ts` draws a floor plan from the real footprint. It rotates the footprint to its long axis, cuts exits at the mapped OpenStreetMap entrances (the longest walls when none are mapped), and lays out a schematic interior: a corridor spine, a cross corridor for squat buildings, and rooms with doors. That drawing goes through the same import pipeline as an uploaded image, so the twin view crossfades in and its camera keeps descending into the usual angled view. A floor only gives Nemotron real choices if every room can reach every exit, so doors are cut wide enough to survive rasterising, the importer walls up gaps that are not one of the plan's exits, joins any area the drawing cut off to the rest of the floor, and `src/campus/__tests__/plan.test.ts` checks that on every featured floor.

## How Nemotron is used

| Role | Model | What it does | Evidence it's real |
|---|---|---|---|
| **Perception** | `nvidia/nemotron-3.5-super-vl-120b-a12b` (vision) | Reads a floor-plan image and returns room boxes, exits and the fire-risk room as JSON. The JSON is validated and becomes the twin's zones, exits and ignition point. | The import log shows latency and room and exit counts; the overlay on the thumbnail is the model's output |
| **Planner / tool user** | same model, tool calling, streamed reasoning (`reasoning_budget` 1024 per turn) | Inspects the twin, proposes contrasting strategies, runs them in parallel on a Web Worker pool, analyses bottlenecks, refines and commits | Every metric in the panel comes from a deterministic simulation the model triggered |
| **Replanner** | same | Receives the environment change plus the re-simulated performance of its previous plan, and adapts | Automatic on any obstacle, fire or blocked exit after a commit |

Reliability around the model:

- Tool arguments are untrusted and pass through `sanitizeStrategy`: ranges are clamped and unknown ids dropped.
- `commit_strategy` refuses a run that scores worse than the baseline.
- A turn whose reasoning overflows the token window is retried in direct-action mode.
- A hard simulation budget caps the number of runs.
- A run that never commits is auto-selected by a deterministic safety score, and labelled as such.
- If the API is unreachable, a labelled scripted fallback runs the same real tools.

With thinking disabled, Nemotron misidentified which exit clears last in a capacity question. With a 300-token reasoning budget it answered correctly (B, 38.5 s), which is why RIFT keeps budgeted reasoning on.

## The campus fire drill

Campus drills model the case that costs lives in documented building fires. The fire starts in the room beside the exit people use every day (the main entrance on the ground floor, Stair A upstairs). Today's procedure is a bell with no other guidance. People take 4–18 s to start moving and head for the exit they know; every other exit is treated as a 3× longer walk. Smoke is thicker and more toxic than in the demo office: a person is overcome after a dose of 24 smoke-seconds (45 in the office). Nobody starts the drill standing inside the fire.

The planner has one extra lever for this: `voiceAlert` (a directed voice message plus floor wardens). It cuts the delay before people move by up to 60%, the effect egress research reports for voice alarms over bells. These values are illustrative, chosen so that plan choices change outcomes; they are not calibrated against a real building.


- **Grid:** 64 × 40 cells. The built-in office uses 0.5 m cells (32 × 20 m); campus buildings and imported plans are scaled to fit the grid.
- **Navigation:** multi-source Dijkstra flow fields per exit with smoke- and fire-weighted costs, refreshed every simulated second. A* answers route queries.
- **Crowd:** up to about 320 agents. Speed follows the Weidmann (1993) speed–density diagram, with smoke slowdown, spatial-hash separation and exit throughput limits of about 1.3 persons/m/s. Pre-movement delay and staged release are modelled.
- **Hazards:** cellular fire spread, and smoke diffusion with decay and venting at exits. Incapacitation uses a simplified smoke-dose threshold.
- **Strategy levers:** per-exit signage bias, warden zone-to-exit assignments, staged zone release, hazard aversion, queue-aware live guidance and reassessment interval.
- **Metrics:** time to 90% evacuated, full evacuation time, smoke dose and high-exposure count, crowd-crush time (person-seconds above 2.5 people/m²), peak density, per-exit usage and named hotspots.
- **Deterministic:** seeded RNG, fixed timestep, separate RNG streams for hazards and population. Every strategy faces the identical fire, and the live replay matches the headless run the agent saw.

## Running it

```bash
npm install
cp .env.example .env.local   # then set NVIDIA_API_KEY
npm run dev                  # http://localhost:5173
npm run build && node server/serve.mjs   # production build with the key proxy, http://127.0.0.1:4173
npm test                     # 57 tests
```

The key is read server-side only and never reaches the bundle. A static host such as Netlify has no proxy, so the agent runs its scripted fallback there.

## Architecture

```
 OpenStreetMap ─► campus.json ─► campus map ─► generated plan ─┐
 floor-plan image ─────────────────────────────────────────────┼─► CV wall grid + Nemotron VL ─► Scenario ─┐
 built-in scenarios ───────────────────────────────────────────┘                                          │
                                                                                                          ▼
   browser: R3F twin (instanced crowd, smoke shader) ◄── live Simulation
            agent panel ◄── loop.ts ──tool calls──► Web Worker pool (headless sims)
                                │
                                ▼  /api/chat (SSE)
            server/nemotron-proxy.mjs (key, origin and content-type checks, model allow-list, timeouts, rate limit)
                                │
                                ▼
            integrate.api.nvidia.com/v1 · Nemotron 3.5 Super VL 120B-A12B
```

## Limitations

- A simplified research model, not CFD or a validated egress model. Use it to compare strategies, not to certify a building.
- Campus interiors are schematic. Footprints and entrances are real map data, but detailed floor plans for campus buildings are not public.
- Floor-plan import is approximate. Walls come from pixel thresholding at a 64 × 40 grid; clean black-line plans work best. A doorway much wider than about 2 m merges two rooms unless the vision model names both.
- Occupancy for imported plans is modelled as a surge (at least 60% of floor-area capacity).
- Single storey only. No stairs or multi-floor egress, and no photo or video reconstruction.
