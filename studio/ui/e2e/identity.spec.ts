import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const FILE = 'characters/roka/character.yml'

const form = (page: Page) => page.getByRole('tabpanel', { name: 'Form' })
const index = (page: Page) => page.getByRole('navigation', { name: 'On this page' })
// A row's name ends with its error count when it has one.
const indexRow = (page: Page, name: string) =>
  index(page).getByRole('button', { name: new RegExp(`^${name}( \\d+ errors?)?$`) })
const band = (page: Page, item: number) => page.locator(`[data-path="situation.timeOfDay[${item}]"]`)

test.describe('Identity', () => {
  test('the index scrolls to a section, marks it, and follows the scroll', async ({ page, studio }) => {
    await studio.open('/identity')
    await expect(index(page).getByRole('button')).toHaveText([
      'id',
      'name',
      'fullName',
      'world',
      'triggers',
      'model',
      'situation',
      'judge'
    ])
    await expect(indexRow(page, 'id')).toHaveAttribute('aria-current', 'location')
    await indexRow(page, 'judge').click()
    await expect(indexRow(page, 'judge')).toHaveAttribute('aria-current', 'location')
    await expect(form(page).getByRole('heading', { name: /^Judge/ })).toBeInViewport()
    await expect(indexRow(page, 'id')).not.toHaveAttribute('aria-current', 'location')

    await form(page).evaluate((element) => element.scrollTo(0, 0))
    await expect(indexRow(page, 'id')).toHaveAttribute('aria-current', 'location')
    await page.locator('[data-path="situation"]').evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await expect(indexRow(page, 'situation')).toHaveAttribute('aria-current', 'location')
  })

  test('a keyboard jump from the index moves focus into the section', async ({ page, studio }) => {
    await studio.open('/identity')
    await indexRow(page, 'model').focus()
    await page.keyboard.press('Enter')
    await expect(form(page).getByRole('textbox', { name: 'Temperature' })).toBeFocused()
    await expect(indexRow(page, 'model')).toHaveAttribute('aria-current', 'location')
  })

  test('Form and YAML keep each other’s edits, and the index works in both', async ({ page, studio }) => {
    await studio.open('/identity')
    await form(page).getByRole('textbox', { name: 'Full name' }).fill('Maniwa Roka II')
    await page.getByRole('tab', { name: 'YAML' }).first().click()
    const source = page.getByRole('textbox', { name: 'character.yml source' })
    await expect(source).toHaveValue(/^fullName: Maniwa Roka II # \{\{char_full\}\} in prompts$/m)

    await indexRow(page, 'judge').click()
    const caretLine = () =>
      source.evaluate((area: HTMLTextAreaElement) => {
        const before = area.value.slice(0, area.selectionStart)
        return area.value.slice(before.lastIndexOf('\n') + 1).split('\n')[0]
      })
    await expect.poll(caretLine).toMatch(/^judge:/)
    await expect(indexRow(page, 'judge')).toHaveAttribute('aria-current', 'location')
    await source.press('Control+Home')
    await expect(indexRow(page, 'id')).toHaveAttribute('aria-current', 'location')

    const text = await source.inputValue()
    await source.fill(text.replace('world: Hoori', 'world: Kyoto'))
    await page.getByRole('tab', { name: 'Form' }).click()
    await expect(form(page).getByRole('textbox', { name: 'World' })).toHaveValue('Kyoto')
    await expect(form(page).getByRole('textbox', { name: 'Full name' })).toHaveValue('Maniwa Roka II')
    await expect(page.locator('main header').getByText('1 unsaved file')).toBeVisible()
  })

  test('saving a scalar rewrites only its characters and keeps every comment', async ({ page, studio }) => {
    await studio.open('/identity')
    const before = studio.disk(FILE)
    await form(page).getByRole('textbox', { name: 'Full name' }).fill('Maniwa Roka II')
    await expect(page.getByText('character.yml · edited')).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(
      before.replace('fullName: Maniwa Roka # {{char_full}}', 'fullName: Maniwa Roka II # {{char_full}}')
    )
    await expect(page.getByText('character.yml · edited')).toHaveCount(0)
  })

  test('list values are added and removed in place', async ({ page, studio }) => {
    await studio.open('/identity')
    const before = studio.disk(FILE)
    const names = page.locator('[data-path="triggers.names"]')
    await names.getByRole('button', { name: 'Add value' }).click()
    const added = names.getByRole('textbox', { name: 'Names 2' })
    await expect(added).toHaveValue('')
    await added.fill('rokachan')
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(before.replace('names: [roka]', 'names: [roka, rokachan]'))

    await names.getByRole('button', { name: 'Remove item 2' }).click()
    await expect(names.getByRole('textbox', { name: 'Names 2' })).toHaveCount(0)
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(before)
  })

  test('an hour band is added and removed as a whole item', async ({ page, studio }) => {
    await studio.open('/identity')
    const before = studio.disk(FILE)
    const bands = page.locator('[data-path="situation.timeOfDay"]')
    await bands.getByRole('button', { name: 'Remove Item 7' }).click()
    await expect(bands.getByRole('heading', { name: /^Item 7/ })).toHaveCount(0)
    // Without the 23-5 band the hours no longer cover the day, so the bot refuses the pack.
    await expect(page.getByRole('alert').filter({ hasText: 'The pack would not load' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await bands.getByRole('button', { name: 'Add item' }).click()
    const last = band(page, 6)
    await last.getByRole('textbox', { name: 'From' }).fill('23')
    await last.getByRole('textbox', { name: 'To' }).fill('5')
    await last.getByRole('textbox', { name: 'Text' }).fill('late night')
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(
      before.replace('text: late night — the shop closed hours ago and you are both still up }', 'text: late night }')
    )
  })

  test('a number field explains bad input and keeps the last good value', async ({ page, studio }) => {
    await studio.open('/identity')
    const temperature = form(page).getByRole('textbox', { name: 'Temperature' })
    await temperature.fill('warm')
    await expect(form(page).getByText('Enter a number.')).toBeVisible()
    await expect(temperature).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
    await temperature.fill('0.7')
    await expect(form(page).getByText('Enter a number.')).toHaveCount(0)
    await expect(page.locator('main header').getByText('1 unsaved file')).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(FILE)).toContain('  temperature: 0.7\n')
  })

  test('an hour band the bot rejects is marked on its field, and Go to field reaches it', async ({ page, studio }) => {
    await studio.open('/identity')
    await band(page, 0).getByRole('textbox', { name: 'To' }).fill('5')
    const banner = page.getByRole('alert').filter({ hasText: 'The pack would not load' })
    await expect(banner).toContainText(
      'character.yml › situation › timeOfDay[0]: from and to must differ; a range may wrap past midnight'
    )
    await expect(band(page, 0).getByRole('alert')).toHaveText('from and to must differ; a range may wrap past midnight')
    await expect(indexRow(page, 'situation')).toContainText('1 error')
    await expect(page.locator('main header').getByText('1 error')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await form(page).evaluate((element) => element.scrollTo(0, 0))
    await banner.getByRole('button', { name: 'Go to field' }).click()
    await expect(band(page, 0).getByRole('textbox', { name: 'From' })).toBeFocused()
    await expect(band(page, 0).getByRole('textbox', { name: 'From' })).toBeInViewport()

    await page.getByRole('tab', { name: 'YAML' }).first().click()
    const source = page.getByRole('textbox', { name: 'character.yml source' })
    const line = (await source.inputValue()).split('\n').findIndex((text) => text.includes('{ from: 5, to: 5')) + 1
    await source.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(0, 0))
    await banner.getByRole('button', { name: `Go to line ${line}` }).click()
    await expect(source).toBeFocused()
    expect(
      await source.evaluate((area: HTMLTextAreaElement) => area.value.slice(area.selectionStart, area.selectionEnd))
    ).toContain('{ from: 5, to: 5')

    await source.fill((await source.inputValue()).replace('{ from: 5, to: 5', '{ from: 5, to: 9'))
    await expect(banner).toBeHidden()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
  })

  test('a problem in another file shows here and Go to field opens its page', async ({ page, studio }) => {
    await studio.open('/voice')
    await page.getByRole('tab', { name: 'YAML' }).first().click()
    const source = page.getByRole('textbox', { name: 'voice.yml source' })
    await source.fill((await source.inputValue()).replace('hardLineFaces: [furious, pouty]', 'hardLineFaces: [angry]'))
    await expect(page.locator('main header').getByText('1 error')).toBeVisible()
    await page
      .getByRole('navigation', { name: 'Studio' })
      .getByRole('link', { name: /^Identity/ })
      .click()
    const banner = page.getByRole('alert').filter({ hasText: 'The pack would not load' })
    await expect(banner).toContainText('voice.yml › hardLineFaces[0]: unknown face group "angry" Fix it in Voice.')
    await banner.getByRole('button', { name: 'Go to field' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Voice' })).toBeVisible()
  })

  test('the right column shows the prompt, the YAML and the diff', async ({ page, studio }) => {
    await studio.open('/identity')
    const aside = page.getByRole('complementary', { name: 'Preview' })
    await expect(aside.getByText(/^\d[\d,]* tokens · [\d,]+ cached$/)).toBeVisible()
    await expect(aside.getByText(/You are Maniwa Roka/)).toBeVisible()
    await aside.getByRole('combobox', { name: 'Hour' }).click()
    await aside.getByRole('option', { name: '06:00' }).click()
    await expect(aside.getByText('early morning', { exact: true })).toBeVisible()
    await expect(aside.getByText(/It's currently early morning/)).toBeVisible()

    await aside.getByRole('tab', { name: 'YAML' }).click()
    await expect(aside.getByText(/^id: roka # Folder-style id/)).toBeVisible()
    await aside.getByRole('tab', { name: 'Diff' }).click()
    await expect(aside.getByText('No unsaved changes in character.yml.')).toBeVisible()

    await form(page).getByRole('textbox', { name: 'World' }).fill('Kyoto')
    const diff = aside.getByRole('table', { name: `Changes in ${FILE}` })
    await expect(diff.getByRole('cell', { name: 'added', exact: true })).toHaveCount(1)
    await expect(diff.getByRole('cell', { name: 'removed', exact: true })).toHaveCount(1)
    await expect(
      diff.getByRole('row').filter({ has: page.getByRole('cell', { name: 'added', exact: true }) })
    ).toContainText('world: Kyoto')
    await aside.getByRole('tab', { name: 'Preview' }).click()
    await expect(aside.getByText(/anything about Kyoto, without narrating/)).toBeVisible()
  })

  test('the Prompts link opens the Prompts page', async ({ page, studio }) => {
    await studio.open('/identity')
    await page.getByRole('link', { name: 'Prompts', exact: true }).last().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Prompts' })).toBeVisible()
    expect(new URL(page.url()).pathname).toMatch(/^\/prompts/)
  })
})
