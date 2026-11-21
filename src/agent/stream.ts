export interface StreamedMessage {
  content: string
  reasoning: string
  tool_calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tokens?: number
  finishReason?: string
}

/** Parse an OpenAI-compatible SSE chat stream, accumulating reasoning, content and tool-call deltas. */
export async function readChatStream(body: ReadableStream<Uint8Array>, onDelta: (m: StreamedMessage) => void): Promise<StreamedMessage> {
  const msg: StreamedMessage = { content: '', reasoning: '', tool_calls: [] }
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    buf += done ? dec.decode() : dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = done ? '' : lines.pop() ?? ''
    let changed = false
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') continue
      let j: { choices?: { delta?: Record<string, unknown>; finish_reason?: string | null }[]; usage?: { total_tokens?: number } }
      try { j = JSON.parse(data) } catch { continue }
      if (j.usage?.total_tokens) msg.tokens = j.usage.total_tokens
      if (j.choices?.[0]?.finish_reason) msg.finishReason = j.choices[0].finish_reason
      const d = j.choices?.[0]?.delta
      if (!d) continue
      const r = (d.reasoning_content ?? d.reasoning) as string | undefined
      if (r) { msg.reasoning += r; changed = true }
      if (typeof d.content === 'string' && d.content) { msg.content += d.content; changed = true }
      const tcs = d.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined
      for (const tc of tcs ?? []) {
        const i = tc.index ?? msg.tool_calls.length
        msg.tool_calls[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } }
        const slot = msg.tool_calls[i]
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.function.name += tc.function.name
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments
        changed = true
      }
    }
    if (changed) onDelta(msg)
    if (done) break
  }
  msg.tool_calls = msg.tool_calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${i}_${Date.now()}` }))
  return msg
}
