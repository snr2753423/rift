# RIFT — Scope (3h budget, user-stated)

## Demo storyboard (2–4 min)
1. Open RIFT: a glowing 3D office floor (digital twin), 240 occupants milling. Honesty strip: "Simplified agent-based simulation — not a certified safety prediction."
2. Pick scenario "Kitchen fire, East wing" → Run baseline: fire spreads, smoke drifts, people herd to nearest exits, a bottleneck forms at the east stair; metrics tick live.
3. Press **Engage Nemotron**: activity panel streams the agent's reasoning, tool calls (`inspect_environment`, `run_simulation` ×N, `analyze_bottlenecks`), real metric results, and its committed strategy + explanation.
4. Split view: baseline vs AI-optimized replay side by side, synced, with delta cards (evac time, peak congestion, smoke exposure).
5. Judge clicks a corridor to drop an obstacle (or blocks an exit) → agent auto-replans live, new strategy, new comparison.

## Must-have (vertical slices, in order)
- S1 Sim engine: grid building, seeded RNG, fire+smoke cellular propagation, Dijkstra flow fields (A* for route queries), agent steering with density slowdown + exit throughput, strategy params, metrics. Unit tested.
- S2 3D twin: walls, exits, instanced crowd, fire, smoke, heatmap overlay, route ribbons, bloom, orbit camera.
- S3 Nemotron agent: server key proxy, tool-calling loop, streamed activity panel, scripted fallback clearly labeled.
- S4 Compare + replan: dual synced viewports, metric deltas, evacuation curve, click-to-place obstacle/fire/block exit → replan.
- S5 Console UI polish.

## Expansion shortlist (planner-approved, anchored to record)
1. Evacuation curve chart (people out vs time, baseline vs AI) — makes the win legible. APPROVED
2. Heatmap modes: density / smoke / danger. APPROVED
3. Glowing route ribbons traced from the flow field per zone. APPROVED
4. Strategy diff card — what the agent changed, in plain language. APPROVED
5. Live/fallback provenance badge + per-call latency/tokens in activity panel (reliability evidence for the Nemotron track). APPROVED
6. Third scenario: overcrowding event (all-hands meeting) + blocked exit. APPROVED
7. Cinematic camera presets + idle auto-orbit. APPROVED
8. Floor-plan image import: client-side CV wall extraction + Nemotron VL exit labeling. APPROVED-STRETCH (only after S1–S5 work)
REJECTED: photo/video 3D reconstruction (deadline; would be faked), multi-floor stairs (time), voice control (gimmick).

## Cut order if late
8 → 7 → 6 → 3.
