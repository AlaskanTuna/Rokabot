import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import '../env.js'
import {
  APP_NAME,
  __resetTestRunTurnFactory,
  __setTestRunTurnFactory,
  destroySession,
  generateResponse,
  sessionService
} from '../../../src/agent/roka.js'
import { seedWorld } from '../toolTrigger.js'
import { loadCaseSet } from '../toolTriggerScoring.js'

/**
 * Every gate case runs on its own fresh channel, so before `sessionState` existed each one was a channel's
 * FIRST turn and no behaviour that accumulates across turns could be measured — the shipped verdicts describe
 * first turns and nothing else (#52). These tests pin the seam end to end, offline: the fixture field reaches
 * ADK session state, and the prompt the agent actually assembles changes because of it.
 */

const temporaryDirectories: string[] = []
const channels: string[] = []

const header = {
  type: 'header',
  tool: 'recall_user',
  guildId: 'eval-guild',
  members: [
    { id: 'sora', username: 'sora', displayName: 'Sora' },
    { id: 'mio', username: 'mio', displayName: 'Mio' }
  ],
  claims: [],
  history: []
}

const probeCase = {
  type: 'case',
  id: 'F1',
  tool: 'recall_user',
  shouldFire: true,
  speakerId: 'sora',
  message: 'what do you know about Mio?'
}

afterEach(async () => {
  __resetTestRunTurnFactory()
  await Promise.all(channels.splice(0).map((channel) => destroySession(channel)))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function writeFixture(lines: unknown[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rokabot-session-state-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'fixture.jsonl')
  await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  return path
}

/** Runs one case the way `runCaseSet` does and returns the system prompt the agent assembled for it. */
async function promptForCase(sessionState?: Record<string, unknown>): Promise<string> {
  const path = await writeFixture([sessionState === undefined ? header : { ...header, sessionState }, probeCase])
  const loaded = await loadCaseSet(path)
  const channelId = `session-state-${channels.length}-${sessionState ? 'seeded' : 'bare'}`
  channels.push(channelId)

  let captured = ''
  __setTestRunTurnFactory(() => async (_attempt, _signal, request) => {
    captured = (request as { stateDelta?: { _systemPrompt?: string } })?.stateDelta?._systemPrompt ?? ''
    return { text: 'mm~', hasText: true, hasFunctionCall: false }
  })

  await seedWorld(loaded.header, channelId)
  await generateResponse({
    channelId,
    guildId: loaded.header.guildId,
    userMessage: probeCase.message,
    displayName: 'Sora',
    username: 'sora',
    userId: 'sora'
  })
  return captured
}

describe('tool-trigger fixture session state', () => {
  it('carries a header sessionState through the loader', async () => {
    const path = await writeFixture([{ ...header, sessionState: { participants: ['Mio'] } }, probeCase])
    const loaded = await loadCaseSet(path)

    expect(loaded.header.sessionState).toEqual({ participants: ['Mio'] })
  })

  it('leaves sessionState absent when the fixture does not ask for one', async () => {
    const path = await writeFixture([header, probeCase])
    const loaded = await loadCaseSet(path)

    expect(loaded.header.sessionState).toBeUndefined()
  })

  // Coerced-and-carried-on is the failure that matters: a seeded state that silently did not apply reads as
  // "this behaviour does not depend on session state", which is the conclusion the field exists to test.
  it('rejects a sessionState that is not an object', async () => {
    const path = await writeFixture([{ ...header, sessionState: ['Mio'] }, probeCase])

    await expect(loadCaseSet(path)).rejects.toThrow('sessionState must be an object')
  })

  it('pre-creates the session the agent will look up, carrying the seeded state', async () => {
    const path = await writeFixture([{ ...header, sessionState: { participants: ['Mio', 'Ren'] } }, probeCase])
    const loaded = await loadCaseSet(path)
    const channelId = 'session-state-precreate'
    channels.push(channelId)

    await seedWorld(loaded.header, channelId)
    const session = await sessionService.getSession({ appName: APP_NAME, userId: channelId, sessionId: channelId })

    expect(session?.state?.participants).toEqual(['Mio', 'Ren'])
  })

  it('creates no session at all when the fixture asks for no state, so the shipped baselines are unchanged', async () => {
    const path = await writeFixture([header, probeCase])
    const loaded = await loadCaseSet(path)
    const channelId = 'session-state-untouched'
    channels.push(channelId)

    await seedWorld(loaded.header, channelId)
    const session = await sessionService.getSession({ appName: APP_NAME, userId: channelId, sessionId: channelId })

    expect(session).toBeFalsy()
  })

  // The decisive pair. A live run costs real quota, and the way to waste it is to measure a prompt that
  // never changed — the empty-roster trap of docs/decisions.md. These two assert the change is real and
  // that it is caused by the fixture field, offline and free, before any money is spent.
  it('renders the group-conversation roster when the fixture seeds other participants', async () => {
    const prompt = await promptForCase({ participants: ['Mio', 'Ren', 'Kaede'] })

    expect(prompt).toContain("You're in a group conversation with:")
  })

  it('renders no roster for the same case without seeded participants', async () => {
    const prompt = await promptForCase()

    expect(prompt).not.toContain("You're in a group conversation with:")
  })
})
