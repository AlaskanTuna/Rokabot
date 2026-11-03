import { MessageFlags } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../character/index.js'
import { collectPageButtons } from '../pagination.js'

type Handler = (interaction?: never) => Promise<void>

function setup(overrides: { pageCount?: number; startPage?: number } = {}) {
  const handlers: Record<string, Handler> = {}
  const collector = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers[event] = handler
      return collector
    })
  }
  const reply = { createMessageComponentCollector: vi.fn(() => collector) }
  const update = vi.fn(async (_button: unknown, _page: number) => {})
  const finish = vi.fn(async (_page: number) => {})

  collectPageButtons({
    reply: reply as never,
    ownerId: 'user-1',
    prefix: 'test',
    pageCount: overrides.pageCount ?? 3,
    startPage: overrides.startPage,
    update,
    finish
  })

  return { handlers, reply, update, finish }
}

function press(handlers: Record<string, Handler>, customId: string, userId = 'user-1') {
  const reply = vi.fn(async () => {})
  const update = vi.fn(async () => {})
  return handlers.collect({ user: { id: userId }, customId, reply, update } as never).then(() => ({ reply, update }))
}

describe('collectPageButtons', () => {
  it('refuses a stranger with the notYours line and leaves the page alone', async () => {
    const { handlers, update, finish } = setup()

    const { reply } = await press(handlers, 'test_next_x', 'stranger')

    expect(reply).toHaveBeenCalledOnce()
    expect(reply).toHaveBeenCalledWith({
      content: character.lines.tools.notYours,
      flags: MessageFlags.Ephemeral
    })
    expect(update).not.toHaveBeenCalled()
    expect(finish).not.toHaveBeenCalled()
  })

  it('steps next and prev and stays inside the page range', async () => {
    const { handlers, update } = setup()

    await press(handlers, 'test_next_x')
    await press(handlers, 'test_next_x')
    await press(handlers, 'test_next_x')

    expect(update.mock.calls.map((call) => call[1])).toEqual([1, 2, 2])
  })

  it('never steps prev below the first page', async () => {
    const { handlers, update } = setup()

    await press(handlers, 'test_prev_x')

    expect(update.mock.calls.map((call) => call[1])).toEqual([0])
  })

  it('starts from the given page', async () => {
    const { handlers, update } = setup({ startPage: 2 })

    await press(handlers, 'test_prev_x')

    expect(update.mock.calls.map((call) => call[1])).toEqual([1])
  })

  it('runs finish with the current page when the collector ends', async () => {
    const { handlers, finish } = setup()

    await press(handlers, 'test_next_x')
    await handlers.end()

    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith(1)
  })
})
