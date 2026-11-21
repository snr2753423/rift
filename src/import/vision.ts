import { parseSemantics, type Semantics } from './floorplan'

const PROMPT = `You are analysing an architectural floor plan for an evacuation simulation.
Return ONLY a JSON object, no prose:
{"title": string,
 "rooms": [{"name": string, "x": number, "y": number, "w": number, "h": number, "occupants": integer}],
 "exits": [{"name": string, "x": number, "y": number}],
 "fire_risk": {"room": string, "x": number, "y": number, "reason": string},
 "notes": [string]}
Coordinates are fractions (0–1) of the image width/height, origin top-left; rooms are axis-aligned boxes.
Exits are openings in the OUTER wall that lead outside (entrances, stair doors, fire exits) — name fire exits "Fire exit …".
occupants = a realistic peak headcount for that room type. fire_risk = the most likely ignition source (kitchen, lab, server room…).
Only report what is visible in the drawing. Do not invent rooms.`

/** Ask Nemotron VL to read room names, exits and the likeliest fire source from the plan image. */
export async function readPlanWithNemotron(dataUrl: string, signal?: AbortSignal): Promise<{ semantics: Semantics | null; latencyMs: number; raw: string }> {
  const t0 = performance.now()
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      temperature: 0,
      seed: 42,
      max_tokens: 4096,
      reasoning_budget: 1024,
    }),
    signal,
  })
  const json = await r.json().catch(() => null)
  if (!r.ok || !json?.success) throw new Error(json?.error ?? `vision request failed (${r.status})`)
  const raw: string = json.data?.choices?.[0]?.message?.content ?? ''
  return { semantics: parseSemantics(raw), latencyMs: Math.round(performance.now() - t0), raw }
}
