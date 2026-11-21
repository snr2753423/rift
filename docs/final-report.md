# RIFT: final report

Build window: 10:36 to about 11:35 on 2026-11-21, well inside the 3-hour budget. Orchestrator model: Claude Opus 5.5.

## What was built

**RIFT**, a 3D evacuation digital twin with a live NVIDIA Nemotron agent that plans by running real simulations.

| Must-have (from `docs/scope.md`) | Status | Evidence |
|---|---|---|
| 1. Gorgeous interactive 3D indoor environment with animated crowds | ✅ | R3F with bloom, an instanced crowd of 236–350 people, orbit controls and 3 camera presets |
| 2. ≥2 emergency scenarios with dynamic hazards | ✅ 3 scenarios + imported plans | Kitchen fire; lab fire with East Stair blocked; all-hands overcrowding with lobby fire |
| 3. Nemotron agent that plans, calls sim tools, evaluates, selects | ✅ live | Browser runs: 4–8 sims and 7–12 tool calls per run, committed by Nemotron |
| 4. Baseline vs AI comparison with computed metrics | ✅ | Synced dual viewports, 5 metric cards, evacuation curves |
| 5. Introduce obstacle → autonomous replan | ✅ live | Obstacle and fire injections each triggered a re-test plus a new committed plan |
| 6. Polished interface showing technical depth | ✅ | Mission-control UI, streamed reasoning, provenance badge, honesty strip |
| Stretch: floor-plan input | ✅ approximate | CV wall extraction + Nemotron VL rooms, exits and fire risk; *Sample clinic* button |
| Stretch: photo/video → 3D | ❌ not attempted | Would have been faked in the time available; stated in the README |

Approved expansions that were built: evacuation curve chart; heatmap modes (danger, density, smoke); flow-field route ribbons; strategy change list; live/fallback provenance badge with per-call latency and tokens; third scenario; camera presets; floor-plan import. Partly built: there is no separate "strategy diff card". The committed decision lists the agent's plain-language `key_changes` instead.

## Measured results (live browser runs, kitchen-fire scenario)

These come from deterministic simulation. Nemotron chooses different strategies on different runs, so the gains vary between runs.

- Run A: full evacuation 65.5 → 48.6 s (−25.8%), 90% evacuated 48.2 → 41.1 s (−14.7%), smoke dose −21%, crowd-crush −26%.
- Run B: 65.5 → 49.2 s (−25%), crowd-crush −25%.
- Run C (final check): 65.5 → 52.3 s (−20%), 90% evacuated −12%.
- Replan after an injected obstacle: full evacuation −27% and crowd-crush −36% against the new baseline.
- Imported clinic plan: crowd-crush −28%, full evacuation −4% (a less congested building, so less to gain).
- Agent wall-clock: about 38–62 s per full run with the per-turn reasoning budget. Without it, runs took over 2 minutes or overflowed their token window.

## Important decisions

- **The agent loop runs in the browser and a thin proxy holds the key.** The simulations are the tools, so they run locally on a Web Worker pool, and parallel tool calls really run in parallel. *Rejected:* a Python backend, which adds a process and latency for no gain.
- **Deterministic simulation with separate RNG streams for hazards and population.** Every strategy faces the identical fire, and the replay matches the headless run Nemotron saw. *Rejected:* a physics engine (out of scope).
- **`reasoning_budget` = 1024 per turn, plus direct-action retry on truncation.** A live test showed thinking-off Nemotron got a capacity question wrong, and a 300-token budget got it right. An unbudgeted run overflowed 6k tokens without acting.
- **Tooling and prompt grounded in domain facts.** The early agent kept sending whole zones across the building. Adding zone-to-exit walking distances and a guidance-first method took it from "never beats baseline" to −20–27%. This is legitimate domain guidance: the model still chooses every parameter.
- **`commit_strategy` refuses runs worse than baseline.** That keeps output reliable. If no run is better, the UI says so instead of claiming a win.
- **Exit labels are WebGL canvas sprites, not drei `<Html>`.** `<Html>` crashed React 19 on viewport remount.
- **Compare view rotates the building 90°** so it fills the narrow split viewports.
- **Floor-plan occupancy modelled as a surge** (≥60% of floor-area capacity). Nemotron VL's "typical" headcount left the agent nothing to optimise. This is disclosed in the UI.

## Assumptions (not user-stated)

- No demo video requested, so `/demo` was not run and no narration-key prompt was sent.
- The live demo runs on the presenter's laptop (`npm run dev` or `npm run build && npm start`). Nothing was deployed to a host; no paid service was used.
- Design direction: dark mission-control console (assumed from "advanced engineering platform").
- Pre-movement 4–18 s, fire-door underuse bias 1.8, incapacitation at 45 smoke-seconds. These are illustrative parameters, not calibrated.

## Tests and checks that actually ran

- `npm test`: **40/40 passing**. Coverage on the logic modules (sim, agent, import, click mapping): **93.4% lines**. UI components and R3F scenes have no unit tests; they were verified visually.
- `tsc -b` and `vite build`: pass. `oxlint src server`: clean.
- Production server smoke test:
  - index → 200;
  - malformed URL → 400 (no crash);
  - text/plain POST → 415;
  - foreign Origin → 403;
  - forged Host (DNS rebinding) → 403;
  - live SSE streaming works;
  - `nvapi-` string absent from `dist/`.
- Live in the browser pane, with Nemotron:
  - 6 full agent runs, 2 autonomous replans (obstacle, fire), 3 floor-plan imports;
  - screenshots at 1600×1000 and 375×812 (mobile stacks to one column);
  - frame rate measured at 33 fps in the scaled preview pane. It was about 20 fps before reducing DPR and smoke layers.
- Two subagent reviews (code, then security). All HIGH and MEDIUM findings were fixed:
  - proxy crash paths;
  - agent races on scenario switch;
  - mid-run changes now trigger a replan;
  - simulation budget cap;
  - wall tunnelling;
  - stream flush;
  - DNS rebinding;
  - label sanitisation against prompt injection;
  - decompression-bomb guard.
- **Not run:** the `verification-loop`, `production-audit` and `delivery-gate` skill files were not invoked by name. Their substance (build, types, lint, tests, coverage, security review, secrets scan) ran as listed above. `npm audit` was not run.

## Remaining issues and risks

- **Live-demo latency:** a full agent run takes about 40–60 s. Engage it right after the baseline starts and narrate the streamed reasoning while it runs. If the venue Wi-Fi fails, the labelled fallback runs instead.
- Nemotron VL output varies between runs at default settings, so RIFT pins `seed: 42, temperature: 0` for imports. The sample clinic gave 7–8 rooms and 3–4 exits across runs.
- Peak density readings (about 9–12 p/m²) exceed physical limits. Separation is soft, so this works as a relative congestion signal only.
- In dev mode only, hot-reloading the store module can drop the baseline. A page refresh fixes it. This does not affect a normal page load.
- The JS bundle is 1.37 MB (390 KB gzip) because Three.js and postprocessing are not code-split.

## Things you may want to remove (with files)

- **Floor-plan import:** `src/import/*`, `src/ui/ImportPanel.tsx`, `public/samples/clinic-plan.svg`, the import CSS at the end of `src/index.css`, and `<ImportPanel />` in `src/ui/LeftRail.tsx`.
- **Streamed reasoning:** `src/agent/stream.ts` and the stream branch in `server/nemotron-proxy.mjs`. Without these the loop falls back to non-streamed responses.
- **Auto-replay loop:** the `holdUntil` block in `src/state/live.ts`.
- **Third scenario:** the `all_hands` entry in `src/sim/scenarios.ts`.

## Highest-value next improvements

1. **Pre-warm the demo:** cache a committed decision per scenario so a judge sees the comparison instantly, then re-run live on demand. High impact, small effort.
2. **Hard collision** between agents (or ORCA) so densities stay physical and crowd-crush is calibrated. High impact, medium effort.
3. **Multi-floor stairs.** Medium impact, large effort.
4. **Code-split three/postprocessing** for faster first paint. Low impact, small effort.
5. **Per-IP rate limiting** on the proxy if it is ever exposed beyond localhost. Low impact while the app stays local.

## Afternoon update (2026-11-21, 16:13–17:30)

**Built:** connected campus floors (every room on all 24 featured floors reaches every exit), a matched campus→twin fly-in, lawns, trees, lit windows and EXIT signs, a phone layout, and a guided first-run experience: a landing that explains what, how and why; a five-step rail; a live caption read from the simulation; a colour key; room names on the floor; an alarm pulse; and a Nemotron impact card shown before the side-by-side replay.

**Casualty-first planning, kept honest.** "Nemotron always lowers casualties" is enforced, not faked. When today's procedure loses anyone, `commit_strategy` refuses any plan that does not lower that number, and the planner gets a real lever (`voiceAlert`: voice message plus wardens). When nobody is lost under either plan, the UI says "everyone survives" and leads with time, smoke and crowding.

**New assumptions (illustrative, not calibrated):**
- campus fire beside the everyday exit;
- non-familiar exits feel 3× longer under today's procedure;
- smoke dose to incapacitation of 24 smoke-seconds (office: 45);
- fire spread 0.22, smoke yield 3.2;
- a voice alert cuts pre-movement by up to 60%;
- nobody spawns inside the fire.

**Measured in the browser** after the review fixes, with people's exit habit kept in every plan (today's procedure → voice alarm plus signs, people lost). Total across 16 floors: 39 → 0.

| Floor | Lost today → with plan |
|---|---|
| MSC floor 1 | 3 → 0 |
| Zachry floor 1 | 2 → 0 |
| Evans Library floor 1 | 8 → 0 |
| Evans Library floor 2 | 14 → 0 |
| Academic Building floor 1 | 5 → 0 |
| Blocker floor 2 | 1 → 0 |
| Rec Center floor 1 | 6 → 0 |

The other floors lose nobody under either plan. A live Nemotron run on MSC floor 1 committed a plan that saved all 3 people: 90% out 8 s sooner, 96% less smoke breathed.

**Recorded gap:** the `design-taste-frontend` skill and its gate scripts target static marketing pages. RIFT is an existing React/R3F app, so only its applicable rules were used:
- show the mechanism early;
- a standout opening moment;
- motion under 300 ms that rests under reduced motion;
- no invented figures;
- no violet.

`gate.mjs`, `sloplint` and the font-instancing steps were not run.

**Checks that ran:**
- vitest: 127 passing;
- `tsc -b`, oxlint and `vite build`: clean;
- Playwright at 1440×900 and 390×844: landing, pick, alarm, drill end, live Nemotron run, impact card, side by side;
- code reviews after each batch. The second review found that plans silently dropped today's exit habit and that "lost" was counted two ways; both are fixed and re-measured.
