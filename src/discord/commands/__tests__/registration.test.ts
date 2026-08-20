import { ApplicationIntegrationType, InteractionContextType } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENTS, attachmentOptionName } from '../../attachments.js'
import { buildCommandBody } from '../index.js'

// /ask replaced both /chat and /search (#19). Retiring two names and adding one moves this list, and the
// comparison below is a sorted array rather than a Set on purpose: a Set absorbs a duplicate command name,
// which Discord rejects and ready.ts swallows into a log line.
const expectedPolicy = {
  ask: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]
  },
  anime: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]
  },
  remind: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]
  },
  gacha: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]
  },
  hangman: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild]
  },
  shiritori: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild]
  },
  stats: {
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild]
  }
} as const

describe('buildCommandBody', () => {
  it('registers exactly the expected set of command names', () => {
    const commandJson = buildCommandBody()

    const names = commandJson.map((command) => command.name).sort()
    const expectedNames = Object.keys(expectedPolicy).sort()

    expect(names).toEqual(expectedNames)
  })

  // Discord has no multi-attachment option type, so /ask exposes one slot per file the mention path accepts.
  it('offers one attachment slot per file the mention path would accept', () => {
    const ask = buildCommandBody().find((command) => command.name === 'ask')

    expect((ask?.options ?? []).filter((option) => option.type === 11).map((option) => option.name)).toEqual(
      Array.from({ length: MAX_ATTACHMENTS }, (_, index) => attachmentOptionName(index))
    )
  })

  // The assertion above derives its expectation from attachmentOptionName, so it holds for whatever that
  // function returns and cannot notice a rename. These names are the user-facing surface of the command —
  // renaming one silently changes what everybody types — so they are pinned literally, once.
  it('names the /ask attachment options for attachments rather than images', () => {
    const ask = buildCommandBody().find((command) => command.name === 'ask')
    const optionNames = (ask?.options ?? []).map((option) => option.name)

    expect(optionNames).toEqual([
      'question',
      ...Array.from({ length: MAX_ATTACHMENTS }, (_, index) => attachmentOptionName(index)),
      'attachment_url'
    ])
  })

  it('sets the expected installation and context policy per command', () => {
    const commandJson = buildCommandBody()

    for (const [name, policy] of Object.entries(expectedPolicy)) {
      const command = commandJson.find((command) => command.name === name)

      expect(command).toMatchObject({
        contexts: policy.contexts,
        integration_types: policy.integrationTypes
      })
    }
  })

  it('never leaves contexts or integration_types undefined', () => {
    const commandJson = buildCommandBody()

    const missingByCommand = Object.fromEntries(
      commandJson
        .filter((command) => command.contexts === undefined || command.integration_types === undefined)
        .map((command) => [command.name, { contexts: command.contexts, integration_types: command.integration_types }])
    )

    expect(missingByCommand).toEqual({})
  })

  it('requires UserInstall wherever PrivateChannel is a context', () => {
    const commandJson = buildCommandBody()

    for (const command of commandJson) {
      if (command.contexts?.includes(InteractionContextType.PrivateChannel)) {
        expect(command.integration_types).toContain(ApplicationIntegrationType.UserInstall)
      }
    }
  })
})
