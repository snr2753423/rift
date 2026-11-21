// Request shaping shared by the local Node proxy and the Netlify Edge Function.
export const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
export const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b'
export const DEFAULT_FALLBACK_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'
export const MAX_BODY = 2_000_000 // room for a base64 floor-plan crop

export const modelsFor = env => ({ model: env.NVIDIA_MODEL || DEFAULT_MODEL, fallback: env.NVIDIA_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL })

/** Validate the browser's body (untrusted) and build the NVIDIA request. Returns { error } or { upstream }. */
export function buildUpstream(body, env) {
  const { model, fallback } = modelsFor(env)
  if (!Array.isArray(body?.messages) || body.messages.length === 0 || body.messages.length > 80) {
    return { error: 'messages must be a non-empty array (max 80)' }
  }
  return {
    upstream: {
      model: body.model === fallback ? fallback : model,
      messages: body.messages,
      tools: Array.isArray(body.tools) && body.tools.length <= 16 ? body.tools : undefined,
      tool_choice: body.tools ? 'auto' : undefined,
      temperature: typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.3,
      top_p: 0.95,
      seed: Number.isInteger(body.seed) ? body.seed : undefined,
      max_tokens: Math.min(Math.max(Number(body.max_tokens) || 4096, 256), 8192),
      chat_template_kwargs: body.thinking === false
        ? { enable_thinking: false }
        : { enable_thinking: true, reasoning_budget: Math.min(4096, Math.max(128, Number(body.reasoning_budget) || 1200)) },
      stream: body.stream === true,
    },
  }
}
