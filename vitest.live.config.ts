import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/harness/__tests__/*.live.test.ts'],
    fileParallelism: false,
    // Deliberately ~2x the expected seven-minute run so this never becomes the binding constraint,
    // unlike PR #38's 5000ms default which masked its p95 result with an opaque timeout.
    testTimeout: 900_000
  }
})
