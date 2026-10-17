import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

const PAGES = ['identity', 'prompts', 'voice', 'moods', 'lines', 'models', 'memory', 'limits', 'discord', 'secrets']

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Accessibility, ${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const name of PAGES) {
      test(`${name} has no WCAG 2.2 AA violations`, async ({ page, studio }) => {
        await studio.open(`/${name}`)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        // Let the ambient glow and the first preview settle so contrast is measured on the final paint.
        await page.waitForTimeout(600)
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
        const summary = results.violations.map(
          (violation) =>
            `${violation.id} (${violation.impact}): ${violation.help} → ${violation.nodes
              .slice(0, 3)
              .map((node) => node.target.join(' '))
              .join(' | ')}`
        )
        expect(summary).toEqual([])
      })
    }

    test('open overlays have no violations', async ({ page, studio }) => {
      await studio.open('/prompts')
      await page.getByRole('button', { name: /^Notifications/ }).click()
      await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
      let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
      expect(results.violations.map((violation) => violation.id)).toEqual([])
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+k')
      await expect(page.getByPlaceholder('Search pages, files and commands')).toBeVisible()
      results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
      expect(results.violations.map((violation) => violation.id)).toEqual([])
    })
  })
}
