import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export const E2E_PORT = Number(process.env.E2E_PORT || 5199)
export const E2E_TOKEN = 'persona-studio-e2e-token-0123456789'

export default defineConfig({
  testDir: './e2e',
  outputDir: join(import.meta.dirname, '..', '..', 'node_modules', '.cache', `persona-studio-e2e-results-${E2E_PORT}`),
  // One server and one sandbox: tests share them, so they run in order.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite build --config studio/ui/vite.config.ts --logLevel warn && npx tsx studio/ui/e2e/serve.ts',
    cwd: join(import.meta.dirname, '..', '..'),
    url: `http://127.0.0.1:${E2E_PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { E2E_PORT: String(E2E_PORT), E2E_TOKEN }
  }
})
