# Handoff: RIFT at tidalBYTE '26

Context for the next person or agent picking this up. Written 2026-11-21, afternoon of the hackathon (submissions due 7:30 PM, judging 8:00 PM in MSC 2300).

## What RIFT is now

The site opens on a 3D map of Texas A&M (OpenStreetMap data). The user is a student or staff member, not a manager: they pick a building they use, pick a floor, tap where they are, and sound the fire alarm. They watch themselves (a maroon pin) evacuate under today's procedure, get a personal result ("You got out in 0:47" or "You didn't make it out"), then ask NVIDIA Nemotron for a better plan. Nemotron runs real simulations as tool calls and commits a plan; both runs replay side by side and a scoreboard compares them (your escape, casualty rate, hurt by smoke, chaos, time until 90% are out).

- Live site: https://rift-safety.netlify.app (deploys from vignesh-nagarajan-vn/rift, branch `main`)
- Team repo: https://github.com/snr2753423/rift (a PR from the fork carries all of this work)

## Run it

```bash
npm install
cp .env.example .env.local   # set NVIDIA_API_KEY
npm run dev                  # http://localhost:5173
npm test                     # 90 tests
npm run lint && npm run build
```

## Where things live

| Area | Files |
|---|---|
| Campus map and fly-in | `src/campus/CampusView.tsx` (flow), `src/campus/CampusMap.tsx` (three.js scene, camera rig), `src/campus/data.ts` |
| Floor plans from footprints | `src/campus/plan.ts` (generator, floors, stairwells), `src/campus/open.ts` (builds a floor's twin), `src/campus/buildings.ts` (featured list) |
| Campus data | `public/campus.json`, rebuilt by `scripts/build-campus.mjs` from an Overpass export (query in the script header) |
| Drill flow ("you") | `src/ui/DrillCard.tsx`, `src/scene/You.tsx`, `src/sim/outcome.ts`, `drill`/`you` in `src/state/store.ts`, stop-at-end in `src/state/live.ts` |
| Nemotron agent | `src/agent/loop.ts`, `src/agent/tools.ts`, `src/state/actions.ts` (live vs fallback), `src/ui/NemotronPill.tsx`, `src/ui/AgentPanel.tsx` |
| Key proxy | `server/upstream.mjs` (shared), `server/nemotron-proxy.mjs` (local), `netlify/edge-functions/chat.js` (deployed, path `/api/chat`) |
| Theme | `src/index.css`: `--maroon: #500000` for brand and "you", `--ai: #76b900` (NVIDIA green) only for Nemotron |

## Left to do, most important first

1. **Turn on live Nemotron on Netlify.** In Netlify, open Site configuration, then Environment variables, add `NVIDIA_API_KEY`, and redeploy. Check that `https://rift-safety.netlify.app/api/chat` returns `"configured": true`. Then run a drill and press "Ask NVIDIA Nemotron for a better plan". The badge should read "Powered by NVIDIA Nemotron", not "Offline fallback". The Edge Function has never run with a real key: nobody has checked that long streamed turns survive on Netlify. Edge Functions limit CPU time and require headers within 40 s; the NVIDIA stream starts well inside that.
2. **Verify the scoreboard visually.** The flow up to the personal result card was checked in a browser. The side-by-side replay and the final scoreboard (`Scoreboard` in `DrillCard.tsx`) were built and type-checked but not looked at after the offline-fallback run.
3. **Re-check the fly-in framing.** The campus close-up was widened (`s.size * 1.7` in `closeUp`, `CampusMap.tsx`) after the last visual check. Click MSC and watch: the map should dissolve while still descending, and the twin's camera should carry on into the angled view (`INTRO_FROM`, `INTRO_MS` in `src/scene/Twin.tsx`).
4. **More realistic 3D.** Not started. Ideas in order of payoff: trees from OpenStreetMap (`natural=tree` nodes, instanced trunks and crowns), grass and park polygons as green ground, a window-band texture on building walls (ExtrudeGeometry side UVs are in metres, so a repeating texture works), lit EXIT signs in the twin. Adding data means extending the Overpass query and `scripts/build-campus.mjs`.
5. **README screenshots are out of date.** They show the previous UI. Replace `docs/screenshots/*.jpg` (campus map, a drill result, the scoreboard) and add the Devpost link when it exists.
6. **Phone layout** of the drill card, floor picker and top bar has not been checked.

## Things to know

- Campus interiors are generated, not real floor plans (those are not public). Footprints, heights and ground-floor entrances are real OpenStreetMap data; upper floors exit by stairwells at the corridor ends. Say so if judges ask.
- Campus drills use a harsher fire than the demo office (`fireSpreadPerSec: 0.09`, `smokeYield: 1.6` in `src/campus/open.ts`). A headless sweep gave 0 to 6 casualties per floor and never a full wipe-out.
- Fire damage is identical under both plans (the plan changes how people move, not the fire), so the scoreboard says that instead of scoring it.
- The offline fallback only runs when `/api/chat` is unreachable or has no key. It is labelled "Offline fallback" everywhere it appears.
- Commits on this project carry no AI co-author lines.
