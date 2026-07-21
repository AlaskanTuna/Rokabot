import { afterEach, describe, expect, it } from 'vitest'
import { beginShutdown, isShuttingDown, resetForTest } from '../shutdownSignal.js'

describe('shutdown signal', () => {
  afterEach(() => {
    resetForTest()
  })

  it('is initially inactive', () => {
    expect(isShuttingDown()).toBe(false)
  })

  it('becomes active when shutdown begins', () => {
    beginShutdown()

    expect(isShuttingDown()).toBe(true)
  })

  it('resets for tests', () => {
    beginShutdown()
    resetForTest()

    expect(isShuttingDown()).toBe(false)
  })
})
