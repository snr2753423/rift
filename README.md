# RIFT — Reality Intelligence & Future Testing

**Show RIFT a building. It builds a digital twin, sets it on fire, and lets an NVIDIA Nemotron agent test the future before it happens.**

RIFT is an AI digital-twin platform for emergency evacuation. It turns a building (a built-in office, or a floor-plan image you upload) into an interactive 3D simulation populated with hundreds of agent-based occupants. Fire spreads, smoke drifts, bottlenecks form. Then an autonomous **Nemotron** agent plans evacuation strategies, **runs real simulations as tool calls**, analyses the bottlenecks, iterates, and commits the best plan. It explains the plan with numbers measured in those runs. Drop an obstacle mid-demo and it replans on its own.

> Simplified agent-based model for exploring strategies. **Not a certified safety prediction.**

---

## What the judges see

1. **A live 3D twin.** Bloom-lit blueprint walls, a glowing crowd, volumetric smoke, flickering fire, a danger heatmap, and flow-field route ribbons.
2. **Engage Nemotron.** The activity panel streams the model's reasoning token by token, followed by its tool calls (`inspect_environment`, parallel `run_simulation`s, `analyze_bottlenecks`, `commit_strategy`) and the real metric deltas each run produced.
3. **Side by side.** The baseline (unguided self-evacuation) and the AI-optimised plan replay in lockstep, with computed metric cards and evacuation curves.
4. **Judge-injected chaos.** Press `O` (obstacle), `F` (fire) or `B` (block exit) and click the twin. The agent re-tests its committed plan under the new conditions and replans autonomously.
5. **Reality input.** Upload a floor plan, or press *Sample clinic*. Computer vision extracts the walls. **Nemotron VL** reads the rooms, the exits and the likeliest ignition source. A new twin is ready in about 15 s.

## How Nemotron is used (three essential roles)

| Role | Model | What it does | Evidence it's real |
|---|---|---|---|
| **Perception** | `nvidia/nemotron-3.5-super-vl-120b-a12b` (vision) | Reads a floor-plan image and returns room boxes, exits and the fire-risk room as JSON. The JSON is validated and becomes the twin's zones, exits and ignition point. | The import log shows the latency and room/exit counts; the overlay on the thumbnail is the model's output |
| **Planner / tool user** | same model, tool calling, streamed reasoning (`reasoning_budget` 1024 per turn) | Inspects the twin, proposes contrasting strategies, runs them **in parallel** on a Web Worker pool, analyses bottlenecks, refines, and commits | Every metric chip in the panel comes from a deterministic simulation the model triggered |
| **Replanner** | same | Receives the environment change plus the re-simulated performance of its previous plan, and adapts | Automatic on any obstacle, fire or blocked exit after a commit |

**Reliability engineering around the model:**

- All tool arguments are untrusted and pass through `sanitizeStrategy`: clamped ranges, unknown ids dropped.
- `commit_strategy` **refuses** a run that scores worse than the baseline.
- A turn whose reasoning overflows the token window is retried in direct-action mode.
- A hard simulation budget caps the number of runs.
- A run that never commits is auto-selected by a deterministic safety score, and labelled as such.
- If the API is unreachable, a **clearly labelled scripted fallback** runs the same real tools.

A finding from the build: with thinking disabled, Nemotron mis-identified which exit clears last in a capacity question. With a 300-token reasoning budget it answered correctly (B, 38.5 s). That's why RIFT keeps budgeted reasoning on.

## The simulation (technically meaningful, deliberately simple)

- **Grid:** 64 × 40 cells at 0.5 m, about 32 × 20 m. The data-driven `LayoutDef` defines walls, furniture, exits and zones.
- **Navigation:** multi-source **Dijkstra flow fields** per exit, with smoke- and fire-weighted costs, refreshed every simulated second. **A\*** answers route queries.
- **Crowd:** 200–350 agents. Speed follows the **Weidmann (1993) speed–density** fundamental diagram, with smoke slowdown, spatial-hash separation and exit throughput limits of about 1.3 persons/m/s. Pre-movement delay and staged release are modelled.
- **Hazards:** a cellular fire-spread model, and smoke diffusion with decay and venting at exits. Incapacitation uses a simplified smoke-dose threshold.
- **Strategy levers** (what the agent controls): per-exit signage bias, warden zone→exit assignments, staged zone release, hazard aversion, queue-aware live guidance, and reassessment interval.
- **Metrics, all computed:**
  - time to 90% evacuated, and full evacuation time;
  - smoke dose and high-exposure count;
  - **crowd-crush time** (person-seconds above 2.5 p/m²) and peak density;
  - per-exit usage, and hotspots with area names.
- **Deterministic:** seeded RNG, fixed timestep, and separate RNG streams for hazards and population. Every strategy faces the identical fire, and the live replay matches the headless run the agent saw.

## Run it

```bash
npm install
```

```bash
cp .env.example .env.local
```

Put your build.nvidia.com key in `.env.local` as `NVIDIA_API_KEY=...`. The free endpoint works.

```bash
npm run dev
```

Open http://localhost:5173. For a production build served together with the key proxy:

```bash
npm run build && node server/serve.mjs
```

That serves http://127.0.0.1:4173. The key is read server-side only and never reaches the bundle.

```bash
npm test
```

That runs 39 tests: simulation, navigation, hazards, strategy sanitisation, agent tools, the full agent loop against scripted SSE streams, the stream parser, floor-plan CV, semantics validation and click mapping.

## Architecture

```
 floor-plan image ──► CV wall grid ─┐
                    Nemotron VL ────┼─► LayoutDef ─► Scenario ──┐
 built-in scenarios ────────────────┘                          │
                                                               ▼
   ┌─────────────── browser ───────────────────────────────────────────────┐
   │  R3F twin (bloom, smoke shader, instanced crowd)  ◄── live Simulation │
   │  Agent panel ◄── loop.ts ──tool calls──► Web Worker pool (headless sims)│
   │                     │                                                  │
   └─────────────────────┼──────────────────────────────────────────────────┘
                         ▼  /api/chat (SSE)
           server/nemotron-proxy.mjs  (key, origin/content-type checks,
                         │             model allow-list, timeouts, rate limit)
                         ▼
           integrate.api.nvidia.com/v1  ·  Nemotron 3.5 Super VL 120B-A12B
```

## Honest limitations

- The simulation is a simplified research toy, not CFD or a validated egress model. Use it to compare strategies, not to certify a building.
- Floor-plan import is **approximate**: walls come from pixel thresholding, and rooms and exits from a vision model. Best results come from clean black-line plans. Photo and video → 3D reconstruction is **not** implemented.
- Occupancy for imported plans is modelled as a surge (at least 60% of floor-area capacity).
- Single storey. No stairs or multi-floor egress.
