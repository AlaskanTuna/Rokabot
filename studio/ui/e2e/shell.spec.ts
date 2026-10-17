import { expect, test } from './fixtures'

test.describe('Shell', () => {
  test('without the token link the studio explains how to open it', async ({ page }) => {
    await page.goto('/prompts')
    await expect(page.getByRole('heading', { name: 'Open the studio from its link' })).toBeVisible()
    await expect(page.getByText('#token=…')).toBeVisible()
  })

  test('the token leaves the address bar and survives a reload', async ({ page, studio }) => {
    await studio.open('/identity')
    expect(page.url()).not.toContain('token')
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Studio' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Identity' })).toBeVisible()
  })

  test('every page answers with the security headers', async ({ request }) => {
    const response = await request.get('/models')
    expect(response.status()).toBe(200)
    const headers = response.headers()
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('no-referrer')
  })

  test('the API refuses a request without the token', async ({ request }) => {
    const response = await request.get('/api/pack')
    expect(response.status()).toBe(401)
  })

  test('sidebar links open every page and mark the current one', async ({ page, studio }) => {
    await studio.open('/prompts')
    const nav = page.getByRole('navigation', { name: 'Studio' })
    for (const name of [
      'Identity',
      'Prompts',
      'Voice',
      'Moods',
      'Lines',
      'Models',
      'Memory',
      'Limits',
      'Discord',
      'Secrets'
    ]) {
      await nav.getByRole('link', { name: new RegExp(`^${name}`) }).click()
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
      await expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-current', 'page')
      expect(new URL(page.url()).pathname).toBe(`/${name.toLowerCase()}`)
    }
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Discord' })).toBeVisible()
  })

  test('the sidebar collapses to a rail and remembers it', async ({ page, studio }) => {
    await studio.open('/prompts')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    const nav = page.getByRole('navigation', { name: 'Studio' })
    await expect(nav.getByRole('link', { name: 'Models' })).toBeVisible()
    expect((await nav.boundingBox())?.width).toBeLessThan(80)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
  })

  test('the theme switch sets light, dark and system, and keeps the choice', async ({ page, studio }) => {
    await studio.open('/prompts')
    const theme = page.getByRole('radiogroup', { name: 'Theme' })
    await theme.getByRole('radio', { name: 'Light theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await theme.getByRole('radio', { name: 'Dark theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(theme.getByRole('radio', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Match system theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('radio', { name: 'Match system theme' }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('radio', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true')
  })

  test('the notification bell opens an empty panel and closes with Escape', async ({ page, studio }) => {
    await studio.open('/prompts')
    const bell = page.getByRole('button', { name: 'Notifications' })
    await bell.click()
    const panel = page.getByRole('dialog', { name: 'Notifications' })
    await expect(panel.getByText("You're all caught up")).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(bell).toBeFocused()
    await bell.click()
    await page.mouse.click(10, 880)
    await expect(panel).toBeHidden()
  })

  test('Ctrl K searches pages and files and runs the choice', async ({ page, studio }) => {
    await studio.open('/prompts')
    await page.keyboard.press('Control+k')
    const search = page.getByPlaceholder('Search pages, files and commands')
    await expect(search).toBeFocused()
    await search.fill('secr')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Secrets' })).toBeVisible()
    await page.getByRole('button', { name: /Search settings/ }).click()
    await search.fill('zzzz-nothing')
    await expect(page.getByText('Nothing matches “zzzz-nothing”.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(search).toBeHidden()
    await page.keyboard.press('Control+k')
    await search.fill('voice.yml')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Voice' })).toBeVisible()
  })

  test('the sidebar shows the pack, its validity and when it was checked', async ({ page, studio }) => {
    await studio.open('/prompts')
    const nav = page.getByRole('navigation', { name: 'Studio' })
    await expect(nav.getByText('characters/roka', { exact: true })).toBeVisible()
    await expect(nav.getByText('Valid')).toBeVisible()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Discard' })).toBeDisabled()
  })

  test('the skip link moves focus to the page', async ({ page, studio }) => {
    await studio.open('/prompts')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  })
})
