import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/harness/__tests__/memoryShadow.eval.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000
  }
})
