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
const OBJECT = reply({ content: '{"city":"Kyoto","population":1460000}' })

function scripted(replies: unknown[]) {
  let last: unknown
  const fetchImpl: typeof fetch = async () => {
    last = replies.shift()
    return Response.json(last)
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
  return { llm, takeBody }
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
  it('is ready when the model answers text, calls the tool and returns the object with thinking off', async () => {
    const { llm, takeBody } = scripted([TEXT, TOOL, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks.map(({ check, ok, thinkingSeen }) => ({ check, ok, thinkingSeen }))).toEqual([
      { check: 'text', ok: true, thinkingSeen: false },
      { check: 'tool', ok: true, thinkingSeen: false },
      { check: 'json', ok: true, thinkingSeen: false }
    ])
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(true)
  })

  it('is not ready when thinking comes back or the tool is skipped', async () => {
    const thinking = reply({ content: 'pong', reasoning_content: 'Let me think about pong.' })
    const { llm, takeBody } = scripted([thinking, TEXT, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks[0]).toMatchObject({ check: 'text', ok: true, thinkingSeen: true })
    expect(checks[1]).toMatchObject({ check: 'tool', ok: false })
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(false)
  })
})
