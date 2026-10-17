import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const FILE = 'characters/roka/lines.yml'

const form = (page: Page) => page.getByRole('tabpanel', { name: 'Form' })
const index = (page: Page) => page.getByRole('navigation', { name: 'On this page' })
const at = (page: Page, path: string) => page.locator(`[data-path="${path}"]`)
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search lines' })
const preview = (page: Page) => page.getByRole('region', { name: 'Discord preview' })
const banner = (page: Page) => page.getByRole('alert').filter({ hasText: 'The pack would not load' })

test.describe('Lines', () => {
  test('search narrows the form and the index, says when nothing matches, and clears', async ({ page, studio }) => {
    await studio.open('/lines')
    const groups = await index(page).getByRole('button').allTextContents()
    expect(groups).toContain('replies')

    await search(page).fill('reminder')
    await expect(page.getByRole('status').filter({ hasText: /groups? match/ })).toHaveText(/^\d+ groups? match$/)
    await expect(index(page).getByRole('button', { name: 'reminders', exact: true })).toBeVisible()
    await expect(index(page).getByRole('button', { name: 'replies', exact: true })).toHaveCount(0)
    await expect(form(page).getByRole('textbox', { name: 'Set in' })).toBeVisible()
    await expect(form(page).getByRole('textbox', { name: 'Decline 1' })).toHaveCount(0)

    // An edit made in the results is a normal edit.
    await form(page).getByRole('textbox', { name: 'None', exact: true }).fill('Nothing pending~')
    await expect(page.locator('main header').getByText('1 unsaved file')).toBeVisible()

    await search(page).fill('zzzz-nothing')
    await expect(form(page).getByText('No line matches “zzzz-nothing”.')).toBeVisible()
    await expect(index(page).getByText('No section matches.')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'No line matches' })).toHaveText(
      'No line matches zzzz-nothing'
    )

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search(page)).toHaveValue('')
    await expect(search(page)).toBeFocused()
    await expect(index(page).getByRole('button')).toHaveText(groups)
    await expect(form(page).getByRole('textbox', { name: 'Decline 1' })).toBeVisible()

    await search(page).fill('MOU~')
    await expect(form(page).getByText(/No line matches/)).toHaveCount(0)
    await search(page).press('Escape')
    await expect(search(page)).toHaveValue('')
    await expect(form(page).getByRole('textbox', { name: 'Decline 1' })).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(FILE)).toContain('  none: Nothing pending~ # /remind list with nothing pending\n')
  })

  test('the preview shows the focused line as Discord would, with its slots', async ({ page, studio }) => {
    await studio.open('/lines')
    await expect(preview(page).getByText('replies.decline[0]')).toBeVisible()
    await expect(preview(page).getByText('Line 1 of 5 in this pool; each post draws one at random.')).toBeVisible()
    await expect(page.getByText('Click a line in the form to preview it.')).toBeVisible()

    await form(page).getByRole('textbox', { name: 'Set in' }).click()
    await expect(page.getByText('Click a line in the form to preview it.')).toHaveCount(0)
    await expect(preview(page).getByText('reminders.setIn', { exact: true })).toBeVisible()
    await expect(preview(page).getByText('/remind in; {{when}} is relative, {{time}} the clock time')).toBeVisible()
    await expect(preview(page).getByRole('strong')).toHaveText('Reminder set!')
    const slots = preview(page).getByRole('listitem')
    await expect(slots).toHaveText([
      /^slot char\s*Filled from character\.yml: Roka$/,
      /^slot char_full\s*Filled from character\.yml: Maniwa Roka$/,
      /^slot world\s*Filled from character\.yml: Hoori$/,
      /^slot when\s*Filled by the bot when it posts the line\s*used$/,
      /^slot time\s*Filled by the bot when it posts the line\s*used$/,
      /^slot timezone\s*Filled by the bot when it posts the line\s*used$/
    ])

    await form(page).getByRole('textbox', { name: 'Ask', exact: true }).click()
    await expect(preview(page).getByText('Slash command description, as the command picker shows it.')).toBeVisible()
    await expect(preview(page).getByText('57 of 100 characters once filled.')).toBeVisible()
    await form(page)
      .getByRole('textbox', { name: 'Ask', exact: true })
      .fill(`Ask {{char}} ${'anything '.repeat(11)}`)
    await expect(preview(page).getByText(/^10\d of 100 characters once filled; Discord refuses a longer/)).toBeVisible()
    await expect(at(page, 'commands.ask').getByRole('alert')).toHaveText('Shorten it to 100 characters or fewer.')

    await at(page, 'stats.chartColors.background').getByRole('textbox').click()
    await expect(preview(page).getByRole('heading', { name: 'Colour preview' })).toBeVisible()
    await expect(preview(page).getByText('#17141f')).toBeVisible()

    await at(page, 'status[0]').getByRole('textbox', { name: 'Lines 2' }).click()
    await expect(preview(page).getByText('Roka is online. Status:')).toBeVisible()
    await expect(preview(page).getByText('Preparing the morning sweets~ 🍡')).toBeVisible()
    await expect(preview(page).getByText('Line 2 of 3 in this pool; each post draws one at random.')).toBeVisible()
  })

  test('an unknown macro is marked on its field, its chip and the banner', async ({ page, studio }) => {
    await studio.open('/lines')
    const field = at(page, 'tools.notYours').getByRole('textbox')
    await field.fill("{{foo}} Those buttons aren't for you~")
    await expect(at(page, 'tools.notYours').getByRole('alert')).toHaveText('unknown macro {{foo}}')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(banner(page)).toContainText('lines.yml › tools › notYours: unknown macro {{foo}}')
    await expect(index(page).getByRole('button', { name: 'tools 1 error' })).toBeVisible()
    await field.click()
    await expect(preview(page).getByRole('listitem').filter({ hasText: 'slot foo' })).toHaveText(
      /^slot foo\s*Not accepted in this line; the bot will not load it\s*used$/
    )
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    // Go to field clears a search that hides the field.
    await search(page).fill('commands')
    await expect(field).toHaveCount(0)
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(search(page)).toHaveValue('')
    await expect(field).toBeFocused()

    await page.getByRole('tab', { name: 'YAML' }).first().click()
    await expect(search(page)).toHaveCount(0)
    const source = page.getByRole('textbox', { name: 'lines.yml source' })
    const line = (await source.inputValue()).split('\n').findIndex((text) => text.includes('{{foo}}')) + 1
    await banner(page)
      .getByRole('button', { name: `Go to line ${line}` })
      .click()
    expect(
      await source.evaluate((area: HTMLTextAreaElement) => area.value.slice(area.selectionStart, area.selectionEnd))
    ).toContain('notYours: "{{foo}} Those buttons')
    await page.getByRole('tab', { name: 'Form' }).click()
    await field.fill("Those buttons aren't for you~")
    await expect(banner(page)).toBeHidden()
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })

  test('an emptied pool says what to do, and a new line fills it', async ({ page, studio }) => {
    await studio.open('/lines')
    const before = studio.disk(FILE)
    const pool = at(page, 'replies.error')
    for (const item of [3, 2, 1]) await pool.getByRole('button', { name: `Remove item ${item}` }).click()
    await expect(pool.getByRole('textbox')).toHaveCount(0)
    await expect(pool.getByRole('alert')).toHaveText('Add at least one item.')
    await expect(banner(page)).toContainText('lines.yml › replies › error: Add at least one item.')
    await pool.getByRole('button', { name: 'Add value' }).click()
    await pool.getByRole('textbox', { name: 'Error 1' }).fill('Nn... let me try that again.')
    await expect(banner(page)).toBeHidden()
    await studio.saveAll()
    const after = studio.disk(FILE)
    const lines = before.split('\n')
    const start = lines.findIndex((line) => line.startsWith('  error: #'))
    expect(after).toBe(
      [
        ...lines.slice(0, start),
        '  error: [Nn... let me try that again.] # A turn or a /stats view failed outright',
        ...lines.slice(start + 4)
      ].join('\n')
    )
  })

  test('a fixed group of pools offers no add or remove, since the bot accepts only its own keys', async ({
    page,
    studio
  }) => {
    await studio.open('/lines')
    const flavor = at(page, 'tools.flavor')
    await expect(flavor.getByRole('heading', { name: /Flavor/ })).toBeVisible()
    await expect(flavor.getByRole('button', { name: /^Add flavor entry/ })).toHaveCount(0)
    await expect(flavor.getByRole('button', { name: /^Remove (anime|schedule|remind)$/i })).toHaveCount(0)
    await expect(flavor.getByRole('button', { name: 'Add value' }).first()).toBeVisible()
  })

  test('the Diff tab shows the unsaved lines', async ({ page, studio }) => {
    await studio.open('/lines')
    const aside = page.getByRole('complementary', { name: 'Line preview' })
    await aside.getByRole('tab', { name: 'Diff' }).click()
    await expect(aside.getByText('No unsaved changes in lines.yml.')).toBeVisible()
    await at(page, 'reliability.safety').getByRole('textbox').fill("Let's not, ne~")
    const diff = aside.getByRole('table', { name: `Changes in ${FILE}` })
    await expect(
      diff.getByRole('row').filter({ has: page.getByRole('cell', { name: 'added', exact: true }) })
    ).toHaveText(/safety: "Let's not, ne~" # The provider blocked/)
    await aside.getByRole('tab', { name: 'Preview' }).click()
    await expect(preview(page)).toBeVisible()
  })
})
