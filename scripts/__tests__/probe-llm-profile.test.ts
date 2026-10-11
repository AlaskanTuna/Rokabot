import { describe, expect, it } from 'vitest'
import { ChatCompletionsLlm } from '../../src/agent/llm/chatCompletionsLlm.js'
import { profileFor } from '../../src/agent/llm/profiles.js'
import { parseProbeArgs, probeProfile, renderProbeReport } from '../probe-llm-profile.js'

const reply = (message: Record<string, unknown>) => ({
  choices: [{ message, finish_reason: 'stop' }],
  usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
})
const TEXT = reply({ content: 'pong' })
const TOOL = reply({
  content: null,
  tool_calls: [
    {
      id: 'call_probe',
      type: 'function',
      function: { name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' }
    }
  ]
})
const ANSWER = reply({ content: 'It is 21:00 in Tokyo.' })
const OBJECT = reply({ content: '{"city":"Kyoto","population":1460000}' })

function scripted(replies: unknown[]) {
  let last: unknown
  const bodies: Array<{ messages: unknown[] }> = []
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    const next = replies.shift()
    if (next instanceof Response) return next
    last = next
    return Response.json(next)
  }
  const llm = new ChatCompletionsLlm({
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-35B-A3B',
    apiKey: 'test-key',
    timeoutMs: 1000,
    profile: profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B'),
    fetchImpl
  })
  const takeBody = () => {
    const body = last
    last = undefined
    return body
  }
  return { llm, takeBody, bodies }
}

describe('parseProbeArgs', () => {
  it('refuses to run under CI', () => {
    expect(() => parseProbeArgs(['--live', '--model', 'Qwen/Qwen3.5-35B-A3B'], { CI: 'true' })).toThrow(
      'never runs in CI'
    )
  })

  it('needs --live and at least one model', () => {
    expect(() => parseProbeArgs(['--model', 'Qwen/Qwen3.5-35B-A3B'], {})).toThrow('--live')
    expect(() => parseProbeArgs(['--live'], {})).toThrow('--model')
  })

  it('collects every --model', () => {
    expect(parseProbeArgs(['--live', '--model', 'a', '--model', 'b'], {})).toEqual({ models: ['a', 'b'] })
  })
})

describe('probeProfile', () => {
  it('is ready when the model answers text, calls the tool, answers its result and returns the object', async () => {
    const { llm, takeBody } = scripted([TEXT, TOOL, ANSWER, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks.map(({ check, ok, thinkingSeen }) => ({ check, ok, thinkingSeen }))).toEqual([
      { check: 'text', ok: true, thinkingSeen: false },
      { check: 'tool', ok: true, thinkingSeen: false },
      { check: 'toolResult', ok: true, thinkingSeen: false },
      { check: 'json', ok: true, thinkingSeen: false }
    ])
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(true)
  })

  it('sends the tool result back as a tool message paired with the call id', async () => {
    const { llm, takeBody, bodies } = scripted([TEXT, TOOL, ANSWER, OBJECT])

    await probeProfile(llm, takeBody)

    expect(bodies[2]?.messages).toEqual([
      { role: 'user', content: 'What time is it in Tokyo right now? Use the tool.' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_probe',
            type: 'function',
            function: { name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_probe', content: '{"time":"2026-10-11T21:00:00+09:00"}' }
    ])
    expect(bodies[2]).toMatchObject({ tools: [{ type: 'function', function: { name: 'get_current_time' } }] })
  })

  it.each<[string, unknown, string]>([
    [
      'the provider rejects the tool message',
      Response.json({ error: { message: "Invalid role 'tool'" } }, { status: 400 }),
      'ModelScope 400'
    ],
    ['the model calls the tool again', TOOL, 'called the tool again'],
    ['the model answers with no text', reply({ content: '' }), 'empty reply']
  ])('is not ready when %s', async (_case, roundTrip, detail) => {
    const { llm, takeBody } = scripted([TEXT, TOOL, roundTrip, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks[2]).toMatchObject({ check: 'toolResult', ok: false })
    expect(checks[2]?.detail).toContain(detail)
    expect(checks[3]).toMatchObject({ check: 'json', ok: true })
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(false)
  })

  it('is not ready when thinking comes back or the tool is skipped', async () => {
    const thinking = reply({ content: 'pong', reasoning_content: 'Let me think about pong.' })
    const { llm, takeBody } = scripted([thinking, TEXT, ANSWER, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks[0]).toMatchObject({ check: 'text', ok: true, thinkingSeen: true })
    expect(checks[1]).toMatchObject({ check: 'tool', ok: false })
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(false)
  })

  const THINKING_SIGNALS: Array<[string, unknown]> = [
    ['a reasoning field', reply({ content: 'pong', reasoning: 'Let me think about pong.' })],
    ['a think tag in the text', reply({ content: '<think>Let me think.</think>pong' })],
    ['a closing think tag in the text', reply({ content: 'Let me think.</think>pong' })],
    [
      'reasoning tokens in the usage',
      {
        ...TEXT,
        usage: { prompt_tokens: 20, completion_tokens: 25, completion_tokens_details: { reasoning_tokens: 20 } }
      }
    ]
  ]

  it.each(THINKING_SIGNALS)('flags thinking from %s', async (_signal, thinking) => {
    const { llm, takeBody } = scripted([thinking, TOOL, ANSWER, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks[0]).toMatchObject({ check: 'text', ok: true, thinkingSeen: true })
    expect(checks.slice(1).map(({ thinkingSeen }) => thinkingSeen)).toEqual([false, false, false])
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(false)
  })

  it('does not flag empty reasoning fields or zero reasoning tokens', async () => {
    const quiet = {
      ...reply({ content: 'pong', reasoning: '', reasoning_content: '  ' }),
      usage: { prompt_tokens: 20, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 0 } }
    }
    const { llm, takeBody } = scripted([quiet, TOOL, ANSWER, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks.map(({ thinkingSeen }) => thinkingSeen)).toEqual([false, false, false, false])
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(true)
  })

  it.each(['Not/AZone', '', '   '])('fails the tool check for the timezone %j', async (timezone) => {
    const bogus = reply({
      content: null,
      tool_calls: [
        {
          id: 'call_probe',
          type: 'function',
          function: { name: 'get_current_time', arguments: JSON.stringify({ timezone }) }
        }
      ]
    })
    const { llm, takeBody } = scripted([TEXT, bogus, ANSWER, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks[1]).toMatchObject({ check: 'tool', ok: false })
    expect(checks[1]?.detail).toContain('unexpected call')
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(false)
  })
})
