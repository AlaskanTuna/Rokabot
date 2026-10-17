import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const TOKEN = 'persona-studio-e2e-token-0123456789'

test.use({ viewport: { width: 900, height: 800 } })

/** Horizontal overflow anywhere: the page itself, or any scrolling box inside the main island. */
function overflow(page: Page) {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>('main, main *')].filter((element) => {
      const { overflowX } = getComputedStyle(element)
      return (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1
    })
    return {
      page: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      boxes: boxes.map((element) => element.getAttribute('aria-label') ?? element.className)
    }
  })
}

for (const [path, title] of [
  ['/identity', 'Identity'],
  ['/voice', 'Voice'],
  ['/lines', 'Lines'],
  ['/models', 'Models'],
  ['/memory', 'Memory'],
  ['/limits', 'Limits'],
  ['/discord', 'Discord']
]) {
  // The studio fixture still resets the sandbox and fails the test on a page error.
  test(`${title} fits 900 px with its header actions in view`, async ({ page, studio: _studio }) => {
    // Below 1024 px the sidebar starts as a rail, so wait for the page heading rather than the sidebar's check time.
    await page.goto(`${path}#token=${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    const header = page.locator('main header')
    for (const control of [
      header.getByRole('button', { name: 'Save changes' }),
      header.getByRole('button', { name: 'Discard' }),
      header.getByRole('button', { name: /^Notifications/ }),
      header.getByRole('radiogroup', { name: 'Theme' })
    ]) {
      await expect(control).toBeVisible()
      await expect(control).toBeInViewport({ ratio: 1 })
    }
    await expect.poll(() => overflow(page)).toEqual({ page: 0, boxes: [] })
  })
}
