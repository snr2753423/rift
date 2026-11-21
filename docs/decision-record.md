grill-me: RAN

# RIFT — Decision Record

Posture: EXECUTION — the first prompt is a near-complete spec; only undecided branches are asked.

| # | Decision | Source | INFERRED | CHOSEN | REJECTED |
|---|----------|--------|----------|--------|----------|
| 1 | Product & audience | USER-STATED | none — user-stated | RIFT (Reality Intelligence & Future Testing): AI digital-twin platform; MVP = indoor emergency evacuation. Audience: TIDAL hackathon judges + NVIDIA Nemotron track judges; framing for facility/safety engineers. | Generic chatbot integration (user forbade it) |
| 2 | Hours left | USER-STATED | none | **3 hours**, absolute. | — |
| 3 | Named API | USER-STATED | NVIDIA's inference API = build.nvidia.com / `integrate.api.nvidia.com/v1` (OpenAI-compatible chat + tool calling) | NVIDIA Nemotron as a tool-calling agent: plan → call sim tools → evaluate metrics → iterate → explain → replan on new obstacle. Clearly labeled demo fallback if live access fails. | Superficial chat panel |
| 4 | Stack / platform | USER-STATED + INFERRED | Web; React Three Fiber named by user | Web app, React + R3F, deterministic agent-based crowd sim on a grid with A*/flow-field, cellular hazard propagation (fire + smoke). | Physics engine, custom model training |
| 5 | Scene input | USER-STATED | Reconstruction from photo/video is a stretch the user pre-authorized cutting | Prebuilt editable procedural building is the primary scene; floor-plan input optional; never claim reconstruction that did not happen. | Photo/video→3D reconstruction in MVP |
| 6 | Nemotron model | USER-STATED + verified | User proposed `nemotron-3.5-super-v1-120b-a12b`; live catalog (integrate.api.nvidia.com/v1/models, 2026-11-21) lists it as `nvidia/nemotron-3.5-super-vl-120b-a12b` (VL = vision-language) | Primary agent: `nvidia/nemotron-3.5-super-vl-120b-a12b` — planner/tool-caller AND floor-plan image interpreter (one model, two genuine roles). Fast fallback: `nvidia/nemotron-3.5-lightning-30b-a3b`. Tool-calling support to be verified live once a key exists. | `llama-3.3-nemotron-super-49b-v1.5` (my earlier suggestion — not in the current catalog); `nemotron-3-ultra-550b` (too slow for live iterative loop) |
| 7 | API key | USER-STATED (verified live: tool call returned in ~1s) | Free endpoint still needs a personal `nvapi-` key | Key goes in `.env.local` as `NVIDIA_API_KEY` (server-side only, gitignored). Until it exists, build runs on a clearly labeled replay fallback; live path is primary. | Pasting key in chat; hardcoding |

| 8 | Agent architecture | INFERRED | Sim must be callable as real tools; key must stay server-side | Deterministic TS sim engine runs headless in the browser; agent loop runs client-side; a thin server proxy holds the key and forwards chat-completions. Tools: inspect_environment, run_simulation, analyze_bottlenecks, commit_strategy. Labeled scripted fallback planner if the API fails — metrics stay real either way. | Python backend (extra process, slower to ship); model-generated metrics (fabrication) |
| 9 | Demo video | ASSUMED | Not requested | No /demo, no narration-key prompt. | — |
| 10 | Deploy | ASSUMED | Live demo on presenter laptop | Local `npm run dev` is the demo path; static build + proxy documented. | Paid hosting |

Design direction (ASSUMED from brief mood: "advanced engineering platform", futuristic): dark mission-control console — near-black graphite, cyan/teal signal accents for system + safe routes, amber→red for hazard, monospace data typography, thin hairline panels, bloom-lit 3D. Restraint over neon soup.

### Risks
- 3h budget: 3D + sim + agent + UI is a lot → build vertical slice first (sim → render → agent → compare), extras only after it works end to end.
- NVIDIA API latency/rate limits on stage → cap agent iterations, stream steps, labeled fallback.
- Home-rooted git repo → `git init` inside RIFT before any commit.
- Sim is simplified; must be labeled "not a safety prediction".

### Accepted unknowns
- Photo/video reconstruction: stretch, likely cut (owner: builder, resolution: after core is done). Floor-plan image import attempted only if time remains.

### Completion criteria
1. 3D building with animated crowd. 2. ≥2 emergency scenarios with spreading hazards. 3. Live Nemotron tool-calling loop that runs real sims and selects a strategy. 4. Side-by-side baseline vs optimized with computed metrics. 5. Click-to-add obstacle → autonomous replan. 6. Polished console UI.
