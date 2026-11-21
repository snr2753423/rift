import { describe, it, expect } from 'vitest'
import { readChatStream } from '../stream'

const sse = (events: unknown[]) => {
  const text = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 37)); c.enqueue(bytes.slice(37)); c.close() } })
}

describe('readChatStream', () => {
  it('parses a final event that has no trailing newline', async () => {
    const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"},"finish_reason":"stop"}]}')
    const m = await readChatStream(new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } }), () => {})
    expect(m.content).toBe('a')
    expect(m.finishReason).toBe('stop')
  })
  it('accumulates reasoning, content and split tool-call arguments', async () => {
    const deltas: string[] = []
    const m = await readChatStream(sse([
      { choices: [{ delta: { reasoning_content: 'Think ' } }] },
      { choices: [{ delta: { reasoning_content: 'hard.' } }] },
      { choices: [{ delta: { content: 'Go.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'run_simulation', arguments: '{"na' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'me":"x"}' } }] } }] },
      { choices: [], usage: { total_tokens: 42 } },
    ]), d => deltas.push(d.reasoning))
    expect(m.reasoning).toBe('Think hard.')
    expect(m.content).toBe('Go.')
    expect(m.tool_calls).toEqual([{ id: 'c1', type: 'function', function: { name: 'run_simulation', arguments: '{"name":"x"}' } }])
    expect(m.tokens).toBe(42)
    expect(deltas.length).toBeGreaterThan(0)
  })
})
