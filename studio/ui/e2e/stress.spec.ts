import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const PAGES = ['identity', 'prompts', 'voice', 'moods', 'lines', 'models', 'memory', 'limits', 'discord', 'secrets']
const WIDTHS = [
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
  { width: 390, height: 844 }
]

async function inViewport(page: Page, name: string) {
  const box = await page.getByRole('button', { name }).first().boundingBox()
  const viewport = page.viewportSize()
  expect(box, `${name} is rendered`).not.toBeNull()
  if (!box || !viewport) return
  expect(box.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${name} ends on screen`).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.width, `${name} is not squeezed`).toBeGreaterThan(24)
}

test.describe('Worst-case data at narrow widths', () => {
  test.use({ dataset: 'worst' })

  for (const size of WIDTHS) {
    test(`every page holds at ${size.width}px`, async ({ page, studio }) => {
      await page.setViewportSize(size)
      await studio.open('/prompts')
      for (const name of PAGES) {
        await page.goto(`/${name}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0)
        if (name !== 'secrets') await inViewport(page, 'Save changes')
      }
    })

    test(`the notifications panel stays on screen at ${size.width}px`, async ({ page, studio }) => {
      await page.setViewportSize(size)
      await studio.open('/prompts/intro.md')
      const editor = page.getByRole('textbox', { name: /intro prompt/i })
      await editor.fill('One.')
      await page.getByRole('button', { name: /^Notifications/ }).click()
      const panel = page.getByRole('dialog', { name: 'Notifications' })
      await expect(panel).toBeVisible()
      const box = await panel.boundingBox()
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width)
      await expect(panel.getByText('Unsaved changes')).toBeVisible()
      await panel.getByRole('button', { name: 'Review diff' }).click()
      await expect(panel).toBeHidden()
    })
  }

  test('model cards stay inside the page with a long model id', async ({ page, studio }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await studio.open('/models')
    const main = await page.locator('main').boundingBox()
    for (const card of await page.locator('main section').all()) {
      const box = await card.boundingBox()
      if (!box || !main) continue
      expect(box.x + box.width, 'a card runs past the page').toBeLessThanOrEqual(main.x + main.width + 1)
    }
  })

  test('a long dialog title wraps instead of pushing the close button away', async ({ page, studio }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await studio.open('/secrets')
    const replace = page.getByRole('button', { name: /^Replace/ }).first()
    await replace.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const close = await dialog.getByRole('button', { name: 'Close' }).boundingBox()
    expect((close?.x ?? 0) + (close?.width ?? 0)).toBeLessThanOrEqual(390)
    await page.keyboard.press('Escape')
  })
})
