import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const ENV = [
  'DISCORD_TOKEN=e2e-discord-token-value-0000',
  'DISCORD_CLIENT_ID=123456789012345678',
  'ANTHROPIC_API_KEY=sk-ant-e2e-0000000000000000000Qx2A',
  'MODELSCOPE_API_KEY=ms-e2e-000000000000008c1e',
  'GEMINI_API_KEY='
]
const envText = (lines: string[]) => `${lines.join('\n')}\n`
const RECREATE = 'docker compose up -d roka'

function screen(page: Page) {
  const list = page.getByRole('list', { name: 'Keys in .env' })
  return {
    list,
    row: (key: string) => list.getByRole('listitem').filter({ hasText: new RegExp(`^${key}`) }),
    badge: page.locator('main header').getByText(/missing$|^All required keys set$/)
  }
}

/** The page source, to prove a value typed into the dialog left no trace once it closed. */
async function expectNotInPage(page: Page, value: string) {
  expect(await page.content()).not.toContain(value)
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(value)
}

test.describe('Secrets', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('lists every key masked, marks what each needs, and the header badge counts missing keys', async ({
    page,
    studio
  }) => {
    await studio.open('/secrets')
    const { list, row, badge } = screen(page)
    await expect(badge).toHaveText('All required keys set')
    await expect(row('ANTHROPIC_API_KEY')).toContainText('Used by main: haiku')
    await expect(row('MODELSCOPE_API_KEY')).toContainText('Used by fallback: qwen122')
    await expect(row('ANTHROPIC_API_KEY')).toContainText('••••Qx2A')
    await expect(row('ANTHROPIC_API_KEY').getByText('Value ending in Qx2A')).toBeAttached()
    await expect(row('DISCORD_CLIENT_ID')).toContainText('••••5678')
    await expect(row('GEMINI_API_KEY')).toContainText('Not set')
    await expect(row('GEMINI_API_KEY').getByText('Optional', { exact: true })).toBeVisible()
    await expect(row('TAVILY_API_KEY').getByRole('button', { name: 'Add TAVILY_API_KEY' })).toHaveText('Add')
    await expect(row('ANTHROPIC_API_KEY').getByRole('button', { name: 'Replace ANTHROPIC_API_KEY' })).toBeVisible()
    await expect(row('GEMINI_API_KEY').getByRole('button', { name: 'Clear GEMINI_API_KEY' })).toHaveCount(0)
    const keys = await list
      .getByRole('listitem')
      .evaluateAll((items) => items.map((item) => item.querySelector('.font-mono')?.textContent))
    // Required keys come first, in .env.example order.
    expect(keys.slice(0, 4)).toEqual(['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'MODELSCOPE_API_KEY', 'ANTHROPIC_API_KEY'])
    for (const line of ENV) {
      const value = line.split('=')[1]
      if (value) await expectNotInPage(page, value)
    }

    await row('DISCORD_TOKEN').getByRole('button', { name: 'Clear DISCORD_TOKEN' }).click()
    await page.getByRole('dialog', { name: 'Clear DISCORD_TOKEN?' }).getByRole('button', { name: 'Clear key' }).click()
    await expect(badge).toHaveText('1 missing')
    await expect(row('DISCORD_TOKEN').getByText('Missing', { exact: true })).toBeVisible()
    await expect(row('DISCORD_TOKEN').getByRole('button', { name: 'Add DISCORD_TOKEN' })).toHaveText('Add key')
  })

  test('Replace writes the value in place, confirms it, and offers the recreate command', async ({ page, studio }) => {
    const value = 'sk-ant-e2e-REPLACED-value-77Zz'
    await studio.open('/secrets')
    const { row } = screen(page)
    const replace = row('ANTHROPIC_API_KEY').getByRole('button', { name: 'Replace ANTHROPIC_API_KEY' })
    await replace.click()
    const dialog = page.getByRole('dialog', { name: 'Set ANTHROPIC_API_KEY' })
    const input = dialog.getByLabel('Value', { exact: true })
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('type', 'password')
    await expect(dialog.getByRole('textbox', { name: 'Key' })).toHaveCount(0)
    await input.fill(value)
    await dialog.getByRole('button', { name: 'Save key' }).click()
    await expect(dialog).toBeHidden()
    await expect(replace).toBeFocused()

    const toast = page.getByRole('status').filter({ hasText: 'Saved ANTHROPIC_API_KEY' })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('Written to .env. Recreate the bot to apply it.')
    await expect(row('ANTHROPIC_API_KEY')).toContainText('••••77Zz')
    expect(studio.disk('.env')).toBe(envText([...ENV.slice(0, 2), `ANTHROPIC_API_KEY=${value}`, ...ENV.slice(3)]))
    await expectNotInPage(page, value)

    await toast.getByRole('button', { name: 'Copy command' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toContainText(RECREATE)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(RECREATE)
    await page.evaluate(() => navigator.clipboard.writeText(''))

    await page.getByRole('button', { name: /Notifications, 1 unread/ }).click()
    const panel = page.getByRole('dialog', { name: 'Notifications' })
    await expect(panel.getByText('Recreate the bot to apply')).toBeVisible()
    await expect(panel.getByText('.env changes need the container recreated, not just restarted.')).toBeVisible()
    await panel.getByRole('button', { name: 'Copy command' }).click()
    await expect(panel).toBeHidden()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(RECREATE)
  })

  test('Add fills an empty or missing key, and Add key restores a required one', async ({ page, studio }) => {
    await studio.open('/secrets')
    const { row, badge } = screen(page)
    await row('GEMINI_API_KEY').getByRole('button', { name: 'Add GEMINI_API_KEY' }).click()
    const gemini = page.getByRole('dialog', { name: 'Set GEMINI_API_KEY' })
    await gemini.getByLabel('Value', { exact: true }).fill('AIza-e2e-gemini-key-0001')
    await gemini.getByLabel('Value', { exact: true }).press('Enter')
    await expect(gemini).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: 'Saved GEMINI_API_KEY' })).toBeVisible()
    await expect(row('GEMINI_API_KEY').getByText('Set', { exact: true })).toBeVisible()

    await row('TAVILY_API_KEY').getByRole('button', { name: 'Add TAVILY_API_KEY' }).click()
    const tavily = page.getByRole('dialog', { name: 'Set TAVILY_API_KEY' })
    await tavily.getByLabel('Value', { exact: true }).fill('tvly e2e "quoted" $value')
    await tavily.getByRole('button', { name: 'Save key' }).click()
    await expect(tavily).toBeHidden()
    await expect(row('TAVILY_API_KEY')).toContainText('••••alue')

    await row('DISCORD_TOKEN').getByRole('button', { name: 'Clear DISCORD_TOKEN' }).click()
    await page.getByRole('dialog', { name: 'Clear DISCORD_TOKEN?' }).getByRole('button', { name: 'Clear key' }).click()
    await expect(badge).toHaveText('1 missing')
    const addKey = row('DISCORD_TOKEN').getByRole('button', { name: 'Add DISCORD_TOKEN' })
    await expect(addKey).toBeFocused()
    await addKey.click()
    const discord = page.getByRole('dialog', { name: 'Set DISCORD_TOKEN' })
    await discord.getByLabel('Value', { exact: true }).fill('new-discord-token-e2e-1234')
    await discord.getByRole('button', { name: 'Save key' }).click()
    await expect(badge).toHaveText('All required keys set')

    expect(studio.disk('.env')).toBe(
      envText([
        ...ENV.slice(1, 4),
        'GEMINI_API_KEY=AIza-e2e-gemini-key-0001',
        `TAVILY_API_KEY='tvly e2e "quoted" $value'`,
        'DISCORD_TOKEN=new-discord-token-e2e-1234'
      ])
    )
  })

  test('Clear asks first: Cancel keeps the key, Clear key removes only its line', async ({ page, studio }) => {
    await studio.open('/secrets')
    const { row, badge } = screen(page)
    const clear = row('MODELSCOPE_API_KEY').getByRole('button', { name: 'Clear MODELSCOPE_API_KEY' })
    await clear.click()
    const dialog = page.getByRole('dialog', { name: 'Clear MODELSCOPE_API_KEY?' })
    await expect(
      dialog.getByText(
        'The key is removed from .env on this machine. The bot needs it to start, so add it again before you recreate the bot.'
      )
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(clear).toBeFocused()
    await clear.click()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
    expect(studio.disk('.env')).toBe(envText(ENV))

    await row('GEMINI_API_KEY').getByRole('button', { name: 'Add GEMINI_API_KEY' }).click()
    await page.getByLabel('Value', { exact: true }).fill('gemini-e2e-0000000000')
    await page.getByRole('button', { name: 'Save key' }).click()
    await row('GEMINI_API_KEY').getByRole('button', { name: 'Clear GEMINI_API_KEY' }).click()
    await expect(
      page
        .getByRole('dialog', { name: 'Clear GEMINI_API_KEY?' })
        .getByText('Models that use it stop working until you add it again.', { exact: false })
    ).toBeVisible()
    await page.getByRole('dialog', { name: 'Clear GEMINI_API_KEY?' }).getByRole('button', { name: 'Cancel' }).click()

    await clear.click()
    await dialog.getByRole('button', { name: 'Clear key' }).click()
    await expect(dialog).toBeHidden()
    const toast = page.getByRole('status').filter({ hasText: 'Cleared MODELSCOPE_API_KEY' })
    await expect(toast).toContainText('Removed from .env. Recreate the bot to apply it.')
    await expect(badge).toHaveText('1 missing')
    await expect(row('MODELSCOPE_API_KEY').getByRole('button', { name: 'Add MODELSCOPE_API_KEY' })).toBeFocused()
    expect(studio.disk('.env')).toBe(
      envText([...ENV.slice(0, 3), 'GEMINI_API_KEY=gemini-e2e-0000000000'].filter((line) => !line.startsWith('MODEL')))
    )
  })

  test('Add secret checks the key and value, and warns about unknown or existing keys', async ({ page, studio }) => {
    await studio.open('/secrets')
    const { row } = screen(page)
    await page.getByRole('button', { name: 'Add secret' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add secret' })
    const key = dialog.getByRole('textbox', { name: 'Key' })
    const value = dialog.getByLabel('Value', { exact: true })
    const save = dialog.getByRole('button', { name: 'Save key' })
    await expect(key).toBeFocused()
    await expect(dialog.getByText('Capital letters, digits and underscores, like MY_API_KEY.')).toBeVisible()

    await save.click()
    await expect(key).toHaveAccessibleDescription('Enter a key name.')
    await expect(key).toBeFocused()
    await expect(value).toHaveAccessibleDescription('Enter a value.')

    await key.fill('my-key')
    await expect(key).toHaveAccessibleDescription('Use capital letters, digits and underscores, like MY_API_KEY.')
    await expect(key).toHaveAttribute('aria-invalid', 'true')
    await save.click()
    await expect(key).toBeFocused()

    await key.fill('DISCORD_TOKEN')
    await expect(key).toHaveAccessibleDescription('DISCORD_TOKEN is already set. Saving replaces it.')
    await key.fill('MY_CUSTM_KEY')
    await expect(key).toHaveAccessibleDescription(
      'MY_CUSTM_KEY is not in .env.example. Check the spelling before you save.'
    )
    await save.click()
    await expect(value).toBeFocused()
    await expect(value).toHaveAccessibleDescription('Enter a value.')
    await value.fill('   ')
    await save.click()
    await expect(value).toHaveAccessibleDescription('Enter a value.')
    expect(studio.disk('.env')).toBe(envText(ENV))

    await value.fill('custom-value-e2e')
    await expect(value).toHaveAccessibleDescription('Written to .env on this machine. Shown masked afterwards.')
    await save.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Add secret' })).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: 'Saved MY_CUSTM_KEY' })).toBeVisible()
    await expect(row('MY_CUSTM_KEY')).toContainText('••••')
    await expectNotInPage(page, 'custom-value-e2e')
    expect(studio.disk('.env')).toBe(envText([...ENV, 'MY_CUSTM_KEY=custom-value-e2e']))

    await page.getByRole('button', { name: 'Add secret' }).click()
    await expect(key).toHaveValue('')
    await expect(value).toHaveValue('')
    await expect(key).toHaveAccessibleDescription('Capital letters, digits and underscores, like MY_API_KEY.')
  })

  test('Show value reveals the typed value until hidden or closed', async ({ page, studio }) => {
    await studio.open('/secrets')
    await screen(page).row('GEMINI_API_KEY').getByRole('button', { name: 'Add GEMINI_API_KEY' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set GEMINI_API_KEY' })
    const value = dialog.getByLabel('Value', { exact: true })
    await value.fill('peekaboo-value-123')
    await dialog.getByRole('button', { name: 'Show value' }).click()
    await expect(value).toHaveAttribute('type', 'text')
    await dialog.getByRole('button', { name: 'Hide value' }).click()
    await expect(value).toHaveAttribute('type', 'password')
    await dialog.getByRole('button', { name: 'Show value' }).click()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expectNotInPage(page, 'peekaboo-value-123')
    await screen(page).row('GEMINI_API_KEY').getByRole('button', { name: 'Add GEMINI_API_KEY' }).click()
    await expect(value).toHaveValue('')
    await expect(value).toHaveAttribute('type', 'password')
    expect(studio.disk('.env')).toBe(envText(ENV))
  })

  test('works from the keyboard alone: Tab, Enter and Escape, with focus returned', async ({ page, studio }) => {
    await studio.open('/secrets')
    const replace = page.getByRole('button', { name: 'Replace DISCORD_CLIENT_ID' })
    await page.getByRole('button', { name: 'Replace DISCORD_TOKEN' }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Clear DISCORD_TOKEN' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(replace).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Set DISCORD_CLIENT_ID' })
    await expect(dialog.getByLabel('Value', { exact: true })).toBeFocused()
    await page.keyboard.type('999999999999999999')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(replace).toBeFocused()
    await expectNotInPage(page, '999999999999999999')

    await page.keyboard.press('Enter')
    await expect(dialog.getByLabel('Value', { exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.type('876543210987654321')
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Show value' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog.getByLabel('Value', { exact: true })).toHaveAttribute('type', 'text')
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Save key' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(replace).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: 'Saved DISCORD_CLIENT_ID' })).toBeVisible()
    expect(studio.disk('.env')).toBe(envText([ENV[0], 'DISCORD_CLIENT_ID=876543210987654321', ...ENV.slice(2)]))
  })

  test('a failed save keeps the dialog open with a readable error and writes nothing', async ({ page, studio }) => {
    await studio.open('/secrets')
    await page.getByRole('button', { name: 'Replace ANTHROPIC_API_KEY' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set ANTHROPIC_API_KEY' })
    const value = dialog.getByLabel('Value', { exact: true })
    const save = dialog.getByRole('button', { name: 'Save key' })
    await value.fill('sk-ant-never-written-0000')

    await page.route('**/api/secrets/ANTHROPIC_API_KEY', (route) => route.abort())
    await save.click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'Persona Studio is not answering. Check that npm run studio is still running.'
    )
    await expect(save).toBeEnabled()
    await expect(value).toHaveValue('sk-ant-never-written-0000')

    await page.unroute('**/api/secrets/ANTHROPIC_API_KEY')
    await page.route('**/api/secrets/ANTHROPIC_API_KEY', (route) => route.fulfill({ status: 500, body: '' }))
    await save.click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'The studio answered 500. Try again, or check the terminal running npm run studio.'
    )

    await page.unroute('**/api/secrets/ANTHROPIC_API_KEY')
    await page.route('**/api/secrets/ANTHROPIC_API_KEY', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { file: null, path: null, message: 'EACCES: permission denied, open .env' } })
      })
    )
    await save.click()
    await expect(dialog.getByRole('alert')).toHaveText('EACCES: permission denied, open .env')
    expect(studio.disk('.env')).toBe(envText(ENV))
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0)

    await page.unroute('**/api/secrets/ANTHROPIC_API_KEY')
    await save.click()
    await expect(dialog).toBeHidden()
    expect(studio.disk('.env')).toContain('ANTHROPIC_API_KEY=sk-ant-never-written-0000\n')
  })

  test('a failed clear keeps the dialog open with the error and keeps the key', async ({ page, studio }) => {
    await studio.open('/secrets')
    await page.getByRole('button', { name: 'Clear ANTHROPIC_API_KEY' }).click()
    const dialog = page.getByRole('dialog', { name: 'Clear ANTHROPIC_API_KEY?' })
    await page.route('**/api/secrets/ANTHROPIC_API_KEY', (route) => route.abort())
    await dialog.getByRole('button', { name: 'Clear key' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'Persona Studio is not answering. Check that npm run studio is still running.'
    )
    await expect(dialog.getByRole('button', { name: 'Clear key' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Clear ANTHROPIC_API_KEY' }).click()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    expect(studio.disk('.env')).toBe(envText(ENV))
  })

  test('Open Secrets from Models scrolls to the key, flashes its row and focuses its action, once', async ({
    page,
    studio
  }) => {
    await studio.open('/models')
    await page.locator('[data-path="llm.models.luna"]').getByRole('button', { name: 'Test connection' }).click()
    await page
      .getByRole('alert')
      .filter({ hasText: 'OPENAI_API_KEY is not set' })
      .getByRole('button', { name: 'Open Secrets' })
      .click()
    const { list, row } = screen(page)
    const add = row('OPENAI_API_KEY').getByRole('button', { name: 'Add OPENAI_API_KEY' })
    await expect(add).toBeFocused()
    await expect(add).toBeInViewport()
    await expect(row('OPENAI_API_KEY')).toHaveAttribute('data-flash', '')
    await expect(row('OPENAI_API_KEY')).not.toHaveAttribute('data-flash')

    // The list reloads after a save; focus stays where the user put it.
    await row('GEMINI_API_KEY').getByRole('button', { name: 'Add GEMINI_API_KEY' }).click()
    await page.getByLabel('Value', { exact: true }).fill('gemini-e2e-focus-0001')
    await page.getByRole('button', { name: 'Save key' }).click()
    await expect(row('GEMINI_API_KEY').getByRole('button', { name: 'Replace GEMINI_API_KEY' })).toBeFocused()
    await expect(page.locator('[data-flash]')).toHaveCount(0)

    await page.goto('/secrets?focus=NOT_A_LISTED_KEY')
    await expect(row('DISCORD_TOKEN')).toBeVisible()
    await expect(page.locator('[data-flash]')).toHaveCount(0)
    expect(await list.evaluate((element) => element.contains(document.activeElement))).toBe(false)
  })

  test('a failed load says so and Retry loads the keys', async ({ page, studio }) => {
    await page.route('**/api/secrets', (route) => route.abort())
    await studio.open('/secrets')
    const error = page.getByRole('alert').filter({ hasText: 'Could not load secrets' })
    await expect(error.getByText('Persona Studio is not answering.', { exact: false })).toBeVisible()
    await page.unroute('**/api/secrets')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(screen(page).row('DISCORD_TOKEN')).toBeVisible()
    await expect(screen(page).badge).toHaveText('All required keys set')
  })
})

test.describe('Secrets with one of everything', () => {
  test.use({ dataset: 'one' })

  test('a required key no file names stays listed as Missing once cleared, and the badge counts it', async ({
    page,
    studio
  }) => {
    await studio.open('/secrets')
    const { row, badge } = screen(page)
    await expect(badge).toHaveText('All required keys set')
    await expect(row('GEMINI_API_KEY')).toContainText('Used by main: flash')
    // DISCORD_CLIENT_ID is required by src/config.ts, GEMINI_API_KEY by the main model; there is no .env.example.
    for (const key of ['DISCORD_CLIENT_ID', 'GEMINI_API_KEY']) {
      await row(key)
        .getByRole('button', { name: `Clear ${key}` })
        .click()
      await page
        .getByRole('dialog', { name: `Clear ${key}?` })
        .getByRole('button', { name: 'Clear key' })
        .click()
      await expect(row(key).getByText('Missing', { exact: true })).toBeVisible()
      await expect(row(key).getByRole('button', { name: `Add ${key}` })).toBeFocused()
    }
    await expect(badge).toHaveText('2 missing')
    expect(studio.disk('.env')).not.toMatch(/DISCORD_CLIENT_ID|GEMINI_API_KEY/)

    await page.reload()
    await expect(row('DISCORD_CLIENT_ID').getByText('Missing', { exact: true })).toBeVisible()
    await expect(row('GEMINI_API_KEY').getByText('Missing', { exact: true })).toBeVisible()
    await expect(badge).toHaveText('2 missing')
  })
})

test.describe('Secrets with worst-case data', () => {
  test.use({ dataset: 'worst' })
  const LONG_ENV = 'OPENROUTER_ENTERPRISE_EU_WEST_PRODUCTION_FALLBACK_API_KEY'

  test('lowercase keys .env already has can be replaced and cleared; a new key must still be capitalised', async ({
    page,
    studio
  }) => {
    await studio.open('/secrets')
    const { row } = screen(page)
    await row('https_proxy').getByRole('button', { name: 'Replace https_proxy' }).click()
    const set = page.getByRole('dialog', { name: 'Set https_proxy' })
    await set.getByLabel('Value', { exact: true }).fill('http://proxy-2.example.com:8080')
    await set.getByRole('button', { name: 'Save key' }).click()
    await expect(set).toBeHidden()
    await expect(row('https_proxy')).toContainText('••••8080')

    await row('no_proxy').getByRole('button', { name: 'Clear no_proxy' }).click()
    const clear = page.getByRole('dialog', { name: 'Clear no_proxy?' })
    await clear.getByRole('button', { name: 'Clear key' }).click()
    await expect(clear).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: 'Cleared no_proxy' })).toBeVisible()
    await expect(row('no_proxy')).toHaveCount(0)
    const env = studio.disk('.env')
    expect(env).toContain('\nhttps_proxy=http://proxy-2.example.com:8080\n')
    expect(env).not.toContain('no_proxy')

    await page.getByRole('button', { name: 'Add secret' }).click()
    const key = page.getByRole('dialog', { name: 'Add secret' }).getByRole('textbox', { name: 'Key' })
    await key.fill('my_proxy')
    await expect(key).toHaveAccessibleDescription('Use capital letters, digits and underscores, like MY_API_KEY.')
    await key.fill('https_proxy')
    await expect(key).toHaveAccessibleDescription('https_proxy is already set. Saving replaces it.')
  })

  test('a long key keeps its start and end, and the name and note show in full on hover', async ({ page, studio }) => {
    await studio.open('/secrets')
    const long = screen(page).row(LONG_ENV)
    const name = long.getByTitle(LONG_ENV, { exact: true })
    await expect(name.getByText('FALLBACK_API_KEY', { exact: true })).toBeVisible()
    const head = name.getByText('OPENROUTER_ENTERPRISE_EU_WEST_PRODUCTION_', { exact: true })
    expect(await head.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await expect(
      long.getByTitle('Used by main: openrouter-qwen3-coder-480b-a35b-instruct', { exact: true })
    ).toBeVisible()

    await long.getByRole('button', { name: `Replace ${LONG_ENV}` }).click()
    const title = page.getByRole('dialog', { name: 'Set OPENROUTER…FALLBACK_API_KEY' }).getByRole('heading')
    await expect(title).toBeVisible()
    expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  })
})
