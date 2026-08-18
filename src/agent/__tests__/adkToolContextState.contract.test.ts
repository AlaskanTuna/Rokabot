import { BaseLlm, InMemorySessionService, LlmAgent, LogLevel, Runner, setLogLevel } from '@google/adk'
import type { BaseLlmConnection, Event, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../../storage/database.js'
import { getFacts } from '../../storage/userMemory.js'
import { rememberUserTool } from '../tools/index.js'

// A contract test against ADK itself, not against this repo's code. Everything past the runAsync call —
// applying stateDelta to the session, deriving CallbackContext state from it, handing that state to
// ToolContext — belongs to @google/adk. interactionCreate.memory.test.ts pins the request this repo builds
// and stops there; this pins that ADK still delivers that request's tenant to the tool, so a version bump
// that changed the propagation fails here rather than silently leaking memory across tenants in production.

// The real Runner logs every appended event at INFO; the gate only needs its failures.
setLogLevel(LogLevel.WARN)

const APP_NAME = 'adk-state-contract'
const CHANNEL = 'contract-channel'
const USER = 'contract-user'
const TENANT = 'dm:contract-channel'

/** A BaseLlm that replays a fixed response list, so the Runner drives a real tool call without a paid request. */
class ScriptedLlm extends BaseLlm {
  private next = 0

  constructor(private readonly script: LlmResponse[]) {
    super({ model: 'scripted-contract-model' })
  }

  async *generateContentAsync(): AsyncGenerator<LlmResponse, void> {
    yield this.script[this.next++]
  }

  connect(): Promise<BaseLlmConnection> {
    throw new Error('ScriptedLlm does not support live connections')
  }
}

/** One turn: the model calls remember_user, ADK runs it, then the model closes the turn with text. */
const REMEMBER_TURN: LlmResponse[] = [
  {
    content: {
      role: 'model',
      parts: [{ functionCall: { name: 'remember_user', args: { fact_key: 'favorite_anime', fact_value: 'Frieren' } } }]
    }
  },
  { content: { role: 'model', parts: [{ text: 'Noted~' }] } }
]

/** Drives REMEMBER_TURN through a real Runner and returns the events it produced. */
async function runTurn(): Promise<Event[]> {
  const agent = new LlmAgent({
    name: 'contract',
    model: new ScriptedLlm(REMEMBER_TURN),
    instruction: '',
    tools: [rememberUserTool],
    disallowTransferToParent: true,
    disallowTransferToPeers: true
  })
  const sessionService = new InMemorySessionService()
  const runner = new Runner({ appName: APP_NAME, agent, sessionService })
  await sessionService.createSession({ appName: APP_NAME, userId: CHANNEL, sessionId: CHANNEL })

  const events: Event[] = []
  for await (const event of runner.runAsync({
    userId: CHANNEL,
    sessionId: CHANNEL,
    newMessage: { role: 'user', parts: [{ text: 'Remember I like Frieren' }] },
    // Caps the agent loop so a script that stops terminating fails the gate instead of hanging it.
    runConfig: { maxLlmCalls: 4 },
    stateDelta: { _userId: USER, _guildId: TENANT }
  })) {
    events.push(event)
  }
  return events
}

/** Flattens the turn's tool results into `[toolName, success]` pairs so a failure names the tool that broke. */
function toolOutcomes(events: Event[]): Array<[string | undefined, unknown]> {
  return events
    .flatMap((event) => (event.content?.parts ?? []).flatMap((part) => part.functionResponse ?? []))
    .map((call) => [call.name, (call.response as { success?: unknown } | undefined)?.success])
}

describe('ADK stateDelta to toolContext.state propagation', () => {
  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
  })

  afterEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('stores the fact under the tenant the runAsync stateDelta named', async () => {
    await runTurn()

    expect(getFacts(TENANT, USER)).toEqual([{ key: 'favorite_anime', value: 'Frieren' }])
  })

  it('reaches the tool with usable tenant state rather than tripping its fail-closed guard', async () => {
    const events = await runTurn()

    expect(toolOutcomes(events)).toEqual([['remember_user', true]])
  })
})
