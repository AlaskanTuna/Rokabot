import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const CONFIG = 'config.yml'

const index = (page: Page) => page.getByRole('navigation', { name: 'On this page' })
const at = (page: Page, path: string) => page.locator(`[data-path="${path}"]`)
const banner = (page: Page) => page.getByRole('alert').filter({ hasText: 'config.yml would not load' })
const field = (page: Page, path: string) => at(page, path).getByRole('textbox')

/** The lines of `after` that are not in `before`, and the reverse: every other line, comments included, must match. */
function lineDiff(before: string, after: string) {
  const old = before.split('\n')
  const now = after.split('\n')
  return { added: now.filter((line) => !old.includes(line)), removed: old.filter((line) => !now.includes(line)) }
}

test.describe('Memory, Limits and Discord', () => {
  test('Memory renders every block, and its index scrolls to each', async ({ page, studio }) => {
    await studio.open('/memory')
    await expect(index(page).getByRole('link')).toHaveText(['Memory', 'Embeddings', 'Session'])
    for (const [name, path] of [
      ['Session', 'session'],
      ['Embeddings', 'embeddings'],
      ['Memory', 'memory']
    ]) {
      await index(page).getByRole('link', { name }).click()
      await expect(at(page, path).getByRole('heading', { level: 2 })).toBeInViewport()
    }
    await expect(field(page, 'memory.bufferSize')).toHaveValue('30')
    await expect(field(page, 'embeddings.timeoutMs')).toHaveValue('1500')
    await expect(field(page, 'session.windowSize')).toHaveValue('20')
  })

  test('a Memory number shows its range, follows the value it depends on, and rejects bad input', async ({
    page,
    studio
  }) => {
    await studio.open('/memory')
    const before = studio.disk(CONFIG)
    await expect(at(page, 'memory.episodeMaxMessages')).toContainText('Allowed: 1 to 27 (from memory.bufferSize).')
    await field(page, 'memory.bufferSize').fill('lots')
    await expect(at(page, 'memory.bufferSize').getByText('Enter a number.')).toBeVisible()
    await field(page, 'memory.bufferSize').fill('40')
    await expect(at(page, 'memory.episodeMaxMessages')).toContainText('Allowed: 1 to 37 (from memory.bufferSize).')
    await expect(banner(page)).toBeHidden()
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: ['  bufferSize: 40 # Max messages in passive ring buffer per channel (in-memory)'],
      removed: ['  bufferSize: 30 # Max messages in passive ring buffer per channel (in-memory)']
    })
  })

  test('a value the bot rejects is marked on its field, with Go to field', async ({ page, studio }) => {
    await studio.open('/memory')
    const buffer = field(page, 'memory.bufferSize')
    await buffer.fill('0')
    await expect(banner(page)).toContainText('memory › bufferSize must be >= 1, got: 0.')
    await expect(at(page, 'memory.bufferSize').getByRole('alert')).toHaveText(
      'Config value memory.bufferSize must be >= 1, got: 0'
    )
    await expect(buffer).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('main header').getByText('1 error')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await index(page).getByRole('link', { name: 'Session' }).click()
    await expect(buffer).not.toBeInViewport()
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(buffer).toBeFocused()
    await expect(buffer).toBeInViewport()
    // A second Go to field on the same path still lands.
    await page.getByRole('button', { name: 'Notifications' }).focus()
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(buffer).toBeFocused()
    await buffer.fill('30')
    await expect(banner(page)).toBeHidden()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
  })

  test('Limits shows the rate limits and model spend, and links to Models', async ({ page, studio }) => {
    await studio.open('/limits')
    const before = studio.disk(CONFIG)
    await expect(at(page, 'rateLimit.rpm')).toContainText('Allowed: 4 or more (from gemini.maxLlmCalls).')
    const spend = page.getByRole('region', { name: /^Model spend/ })
    await expect(spend.getByRole('heading', { name: /^Monthly budget \(USD\)/ })).toBeVisible()
    await expect(spend.getByText(/^Local monthly spend cap per paid provider/)).toBeVisible()
    await field(page, 'llm.monthlyBudgetUsd.anthropic').fill('12.5')
    await field(page, 'rateLimit.rpd').fill('400')
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: ['    anthropic: 12.5', '  rpd: 400 # Requests per day (Gemini free tier: 500)'],
      removed: ['    anthropic: 5', '  rpd: 500 # Requests per day (Gemini free tier: 500)']
    })
    await spend.getByRole('link', { name: 'Edit them in Models' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Models' })).toBeVisible()
  })

  test('a Limits error shows on another page and Go to field comes back to it', async ({ page, studio }) => {
    await studio.open('/limits')
    await field(page, 'rateLimit.rpm').fill('2')
    await expect(at(page, 'rateLimit.rpm').getByRole('alert')).toHaveText(
      'Config value rateLimit.rpm must be >= 4, got: 2'
    )
    await field(page, 'llm.monthlyBudgetUsd.openai').fill('-1')
    // The bot reports one config error at a time, so the first one stays until it is fixed.
    await expect(banner(page)).toContainText('rateLimit › rpm must be >= 4, got: 2.')
    await page
      .getByRole('navigation', { name: 'Studio' })
      .getByRole('link', { name: /^Discord/ })
      .click()
    await expect(banner(page)).toContainText('Fix it in Limits, then save again.')
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Limits' })).toBeVisible()
    await expect(field(page, 'rateLimit.rpm')).toBeFocused()

    await field(page, 'rateLimit.rpm').fill('15')
    await expect(banner(page)).toContainText('llm › monthlyBudgetUsd › openai must be >= 0, got: -1.')
    await expect(at(page, 'llm.monthlyBudgetUsd.openai').getByRole('alert')).toBeVisible()
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(field(page, 'llm.monthlyBudgetUsd.openai')).toBeFocused()
    await field(page, 'llm.monthlyBudgetUsd.openai').fill('5')
    await expect(banner(page)).toBeHidden()
  })

  test('Discord renders every block, toggles write true or false, and Discard restores', async ({ page, studio }) => {
    await studio.open('/discord')
    const before = studio.disk(CONFIG)
    const names = [
      'Discord',
      'Social posts',
      'Media',
      'Emoji',
      'Reminders',
      'Games',
      'Updates',
      'Report',
      'Metrics',
      'Logging',
      'General'
    ]
    await expect(index(page).getByRole('link')).toHaveText(names)
    await index(page).getByRole('link', { name: 'General' }).click()
    await expect(page.getByRole('region', { name: 'General' })).toBeInViewport()
    await index(page).getByRole('link', { name: 'Social posts' }).click()
    await expect(at(page, 'socialPosts').getByRole('heading', { level: 2 })).toBeInViewport()

    const enabled = at(page, 'socialPosts.enabled').getByRole('switch', { name: 'Enabled' })
    await enabled.click()
    await expect(enabled).toHaveAttribute('aria-checked', 'false')
    await field(page, 'discord.maxMessageLength').fill('2000')
    await expect(page.locator('main header').getByText('1 unsaved file')).toBeVisible()
    await page.getByRole('button', { name: 'Discard' }).click()
    const dialog = page.getByRole('dialog', { name: 'Discard 1 unsaved change?' })
    await expect(dialog).toContainText('config.yml')
    await dialog.getByRole('button', { name: 'Discard' }).click()
    await expect(enabled).toHaveAttribute('aria-checked', 'true')
    await expect(field(page, 'discord.maxMessageLength')).toHaveValue('1500')
    expect(studio.disk(CONFIG)).toBe(before)

    await at(page, 'updates.notify').getByRole('switch', { name: 'Notify' }).click()
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: ['  notify: false # DM the bot owner once per new GitHub release'],
      removed: ['  notify: true # DM the bot owner once per new GitHub release']
    })
  })

  test('Discord rejects a value past its bound on the field', async ({ page, studio }) => {
    await studio.open('/discord')
    const length = field(page, 'discord.maxMessageLength')
    await expect(at(page, 'discord.maxMessageLength')).toContainText('Allowed: 1 to 3,927.')
    await length.fill('5000')
    await expect(at(page, 'discord.maxMessageLength').getByRole('alert')).toHaveText(
      'Config value discord.maxMessageLength must be <= 3927, got: 5000'
    )
    await expect(banner(page)).toContainText('discord › maxMessageLength must be <= 3927, got: 5000.')
    await index(page).getByRole('link', { name: 'General' }).click()
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(length).toBeFocused()
    await length.fill('3927')
    await expect(banner(page)).toBeHidden()
  })

  test('the character pack is read-only on Discord and says where to change it', async ({ page, studio }) => {
    await studio.open('/discord')
    const general = page.getByRole('region', { name: 'General' })
    const pack = general.getByRole('textbox', { name: 'Character' })
    await expect(pack).toHaveAttribute('readonly', '')
    await expect(pack).toHaveValue(/characters\/roka$/)
    await expect(
      general.getByText(
        'Read-only here. Switch the character pack from the sidebar, which checks that the pack loads first.'
      )
    ).toBeVisible()
    await pack.press('End')
    await page.keyboard.type('x')
    await expect(pack).toHaveValue(/characters\/roka$/)
    await expect(general.getByRole('textbox', { name: 'Timezone' })).toHaveValue('Asia/Singapore')
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })
})
