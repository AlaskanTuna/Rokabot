import { type Page, test as base, expect } from '@playwright/test'
import { SANDBOX, readSandbox, resetSandbox } from './sandbox'
import { type Dataset, applyDataset, datasetFromEnv } from './worst-case'

const TOKEN = 'persona-studio-e2e-token-0123456789'

interface Studio {
  /** Opens a studio path with the session token and waits for the pack to load. */
  open: (path?: string) => Promise<void>
  /** A sandbox file as it is on disk now, e.g. `characters/roka/voice.yml`. */
  disk: (path: string) => string
  /** Clicks the header's Save changes and waits for the success toast. */
  saveAll: () => Promise<void>
}

/**
 * Every test starts from a fresh sandbox and fails on any uncaught page error or console error, so a broken
 * interaction cannot pass quietly.
 */
export const test = base.extend<{ dataset: Dataset | undefined; studio: Studio }>({
  // No dataset by default; E2E_DATA sets one for a whole run, and a spec opts in with test.use({ dataset: 'worst' }).
  dataset: [datasetFromEnv(), { option: true }],
  studio: async ({ page, dataset }, use) => {
    resetSandbox(SANDBOX)
    if (dataset) applyDataset(SANDBOX, dataset)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !/Failed to load resource: (the server responded with a status of (4|5)\d\d|net::ERR_FAILED)/.test(
          message.text()
        )
      ) {
        errors.push(`console: ${message.text()}`)
      }
    })
    await use({
      open: async (path = '/prompts') => {
        await page.goto(`${path}#token=${TOKEN}`)
        await expect(page.getByRole('navigation', { name: 'Studio' })).toBeVisible()
        // The expanded sidebar says when it checked the pack; the narrow-screen rail shows a status dot instead.
        await expect(
          page.getByText(/Checked \d+ (s|min) ago/).or(page.getByRole('img', { name: /^(Pack valid|\d+ errors?)$/ }))
        ).toBeVisible()
      },
      disk: (path) => readSandbox(SANDBOX, path),
      saveAll: async () => {
        await page.getByRole('button', { name: 'Save changes' }).click()
        // The unsaved badge goes only when this save lands; an earlier save's toast may still be showing.
        await expect(page.locator('main header').getByText(/\d+ unsaved files?/)).toHaveCount(0)
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: /^Saved/ })
            .last()
        ).toBeVisible()
      }
    })
    expect(errors, 'the page logged errors').toEqual([])
  }
})

export { expect }

export async function header(page: Page) {
  return page.locator('main header')
}
