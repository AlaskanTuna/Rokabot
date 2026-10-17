import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { SANDBOX } from './sandbox'

const PACK = 'characters/roka'
const CHARACTER = `${PACK}/character.yml`
const ORDER = [
  'intro',
  'who-you-are',
  'how-you-speak',
  'answering',
  'images',
  'audio-video',
  'tools',
  'boundaries',
  'speech'
]

function lists(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Prompt files' })
  return {
    nav,
    order: nav.getByRole('list', { name: 'System prompt sections, top to bottom' }),
    others: nav.getByRole('list', { name: 'Other prompts' }),
    live: nav.locator('[aria-live="polite"]')
  }
}

/** A row's select button, named by its file name and source badge. */
const row = (scope: Locator | Page, name: string) =>
  scope.getByRole('button', { name: new RegExp(`^${name} (pack|harness|locked|missing)$`) })

/** A row of the order list; `has` locators start from the row, so the button is looked up from the page root. */
const item = (page: Page, name: string) =>
  lists(page)
    .order.locator('li')
    .filter({ has: row(page, name) })

async function orderNames(order: Locator): Promise<string[]> {
  return order
    .locator('li')
    .evaluateAll((items) => items.map((item) => item.querySelector('.font-mono')?.textContent ?? ''))
}

/** character.yml after a save differs from the original only on its prompt.system line. */
function expectOnlySystemLine(before: string, after: string, names: string[]) {
  const was = before.split('\n')
  const now = after.split('\n')
  expect(now).toHaveLength(was.length)
  const changed = now.flatMap((line, index) => (line === was[index] ? [] : [index]))
  expect(changed).toHaveLength(1)
  expect(was[changed[0]]).toMatch(/^ {2}system: \[/)
  expect(now[changed[0]]).toBe(`  system: [${names.join(', ')}]`)
}

test.describe('Prompts', () => {
  test('selecting a file from either group moves the URL, and a reload keeps it', async ({ page, studio }) => {
    await studio.open('/prompts')
    const { order, others } = lists(page)
    await expect(row(order, 'intro')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('textbox', { name: 'intro prompt' })).toHaveValue(
      studio.disk(`${PACK}/prompts/intro.md`)
    )

    await row(order, 'who-you-are').click()
    await expect(page).toHaveURL(/\/prompts\/who-you-are\.md$/)
    await expect(row(order, 'who-you-are')).toHaveAttribute('aria-current', 'true')
    await expect(row(order, 'intro')).not.toHaveAttribute('aria-current', 'true')
    await expect(page.locator('main').getByText(`${PACK}/prompts/who-you-are.md`, { exact: true })).toBeVisible()

    await row(others, 'situation').click()
    await expect(page).toHaveURL(/\/prompts\/situation\.md$/)
    await expect(page.getByRole('textbox', { name: 'situation prompt' })).toHaveValue(
      studio.disk('prompts/situation.md')
    )
    await page.reload()
    await expect(row(lists(page).others, 'situation')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('textbox', { name: 'situation prompt' })).toBeVisible()

    await page.goBack()
    await expect(row(lists(page).order, 'who-you-are')).toHaveAttribute('aria-current', 'true')
    await studio.open('/prompts/answering.md')
    await expect(row(lists(page).order, 'answering')).toHaveAttribute('aria-current', 'true')
    await studio.open('/prompts/not-a-file.md')
    await expect(page).toHaveURL(/\/prompts\/intro\.md$/)
  })

  test('Alt+Arrow moves a section, announces it, and saves only the order line', async ({ page, studio }) => {
    const before = studio.disk(CHARACTER)
    await studio.open('/prompts')
    const { order, live } = lists(page)
    const who = row(order, 'who-you-are')
    await who.focus()
    await page.keyboard.press('Alt+ArrowUp')
    await expect(live).toHaveText('who-you-are moved to position 1 of 9.')
    await expect(row(order, 'who-you-are')).toBeFocused()
    expect(await orderNames(order)).toEqual(['who-you-are', 'intro', ...ORDER.slice(2)])
    await page.keyboard.press('Alt+ArrowUp')
    await expect(live).toHaveText('who-you-are is already first.')

    await row(order, 'speech').focus()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(live).toHaveText('speech is already last.')
    await page.keyboard.press('Alt+ArrowUp')
    await expect(live).toHaveText('speech moved to position 8 of 9.')
    await expect(row(order, 'speech')).toBeFocused()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(live).toHaveText('speech moved to position 9 of 9.')

    await expect(page.locator('main header').getByText('1 unsaved file')).toBeVisible()
    await studio.saveAll()
    expectOnlySystemLine(before, studio.disk(CHARACTER), ['who-you-are', 'intro', ...ORDER.slice(2)])
  })

  test('dragging a section by its handle reorders it', async ({ page, studio }) => {
    const before = studio.disk(CHARACTER)
    await studio.open('/prompts')
    const { order, live } = lists(page)
    const speech = item(page, 'speech')
    await speech.getByTitle('Drag to reorder').dragTo(order.locator('li').first(), { targetPosition: { x: 60, y: 4 } })
    await expect(live).toHaveText('speech moved to position 1 of 9.')
    expect(await orderNames(order)).toEqual(['speech', ...ORDER.slice(0, -1)])

    const intro = item(page, 'intro')
    await intro.getByTitle('Drag to reorder').dragTo(order.locator('li').nth(3), { targetPosition: { x: 60, y: 30 } })
    await expect(live).toHaveText('intro moved to position 4 of 9.')
    const expected = ['speech', 'who-you-are', 'how-you-speak', 'intro', ...ORDER.slice(3, -1)]
    expect(await orderNames(order)).toEqual(expected)
    await studio.saveAll()
    expectOnlySystemLine(before, studio.disk(CHARACTER), expected)
  })

  test('removing a section moves it to Other prompts, and Add to order brings it back', async ({ page, studio }) => {
    await studio.open('/prompts')
    const { order, others, live } = lists(page)
    await expect(order.getByRole('button', { name: 'Remove boundaries from the order' })).toHaveCount(0)
    await row(order, 'how-you-speak').focus()
    await page.keyboard.press('Tab')
    const remove = order.getByRole('button', { name: 'Remove how-you-speak from the order' })
    await expect(remove).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(live).toHaveText('how-you-speak removed from the order. Its file stays under Other prompts.')
    await expect(row(order, 'answering')).toBeFocused()
    expect(await orderNames(order)).toEqual(ORDER.filter((name) => name !== 'how-you-speak'))

    await row(others, 'how-you-speak').click()
    await expect(
      page.getByText('Not in the system prompt order, so it is not part of the cached prefix.')
    ).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(CHARACTER)).toContain(`system: [${ORDER.filter((name) => name !== 'how-you-speak').join(', ')}]`)
    expect(studio.disk(`${PACK}/prompts/how-you-speak.md`)).not.toBe('')

    await page.getByRole('button', { name: 'Add to order' }).click()
    await expect(row(order, 'how-you-speak')).toHaveAttribute('aria-current', 'true')
    expect((await orderNames(order)).at(-1)).toBe('how-you-speak')
    await expect(page.getByRole('button', { name: 'Add to order' })).toHaveCount(0)
  })

  test('locked sections stay in the order while the rest can be removed', async ({ page, studio }) => {
    await studio.open('/prompts')
    const { order } = lists(page)
    for (const name of ORDER.slice(0, -1)) {
      if (name === 'boundaries') continue
      await item(page, name).hover()
      await order.getByRole('button', { name: `Remove ${name} from the order` }).click()
    }
    expect(await orderNames(order)).toEqual(['boundaries', 'speech'])
    await item(page, 'speech').hover()
    await order.getByRole('button', { name: 'Remove speech from the order' }).click()
    expect(await orderNames(order)).toEqual(['boundaries'])
    await expect(order.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  })

  test('Add section checks the name, then adds a new pack file or reuses a harness prompt', async ({
    page,
    studio
  }) => {
    await studio.open('/prompts')
    const { nav, order, others, live } = lists(page)
    await nav.getByRole('button', { name: 'Add section' }).click()
    const name = nav.getByRole('textbox', { name: 'Section name' })
    const add = nav.getByRole('button', { name: 'Add', exact: true })
    await expect(name).toBeFocused()
    await expect(add).toBeDisabled()
    await expect(add).toHaveAttribute('title', 'Type a section name first')
    await page.keyboard.press('Enter')
    await expect(name).toBeVisible()

    await name.fill('Back Story')
    await expect(
      nav.getByText('Use lowercase letters, digits and dashes, starting with a letter or digit.')
    ).toBeVisible()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(add).toBeDisabled()
    await name.fill('intro')
    await expect(nav.getByText('That section is already in the order.')).toBeVisible()
    await expect(add).toBeDisabled()
    await name.press('Escape')
    await expect(name).toBeHidden()
    await nav.getByRole('button', { name: 'Add section' }).click()
    await nav.getByRole('button', { name: 'Cancel' }).click()
    await expect(name).toBeHidden()

    await nav.getByRole('button', { name: 'Add section' }).click()
    await name.fill('backstory')
    await expect(nav.getByText('An existing harness prompt is reused', { exact: false })).toBeVisible()
    await name.press('Enter')
    await expect(live).toHaveText('backstory added at position 10.')
    await expect(page).toHaveURL(/\/prompts\/backstory\.md$/)
    await expect(row(order, 'backstory')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('textbox', { name: 'backstory prompt' })).toHaveValue('## Backstory\n\n')

    await nav.getByRole('button', { name: 'Add section' }).click()
    await name.fill('forget-tool')
    await add.click()
    await expect(row(order, 'forget-tool')).toHaveAttribute('aria-current', 'true')
    await expect(row(others, 'forget-tool')).toHaveCount(0)
    await expect(page.getByText('Harness prompt: shared by every pack. Edits here change all of them.')).toBeVisible()

    await expect(page.locator('main header').getByText('2 unsaved files')).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(CHARACTER)).toContain(`system: [${[...ORDER, 'backstory', 'forget-tool'].join(', ')}]`)
    expect(studio.disk(`${PACK}/prompts/backstory.md`)).toBe('## Backstory\n\n')
    expect(studio.disk(`${PACK}/prompts/forget-tool.md`)).toBe('')
  })

  test('a locked harness prompt is read-only and cannot be removed', async ({ page, studio }) => {
    await studio.open('/prompts/boundaries.md')
    const editor = page.getByRole('textbox', { name: 'boundaries prompt' })
    await expect(editor).toHaveAttribute('readonly', '')
    await expect(page.getByText('Locked by the harness')).toBeVisible()
    await expect(
      page.getByText('Packs cannot change safety sections, so every pack uses this text as written.')
    ).toBeVisible()
    const text = await editor.inputValue()
    await editor.click()
    await page.keyboard.type('changed')
    await expect(editor).toHaveValue(text)
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Override in this pack' })).toHaveCount(0)
  })

  test('Override in this pack copies a harness prompt, and Use harness version deletes the copy', async ({
    page,
    studio
  }) => {
    await studio.open('/prompts/answering.md')
    const own = `${PACK}/prompts/answering.md`
    const harness = studio.disk('prompts/answering.md')
    await expect(page.getByText('Harness prompt: shared by every pack. Edits here change all of them.')).toBeVisible()
    await expect(page.locator('main').getByText('prompts/answering.md', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Override in this pack' }).click()
    await expect(page.locator('main').getByText(own, { exact: true })).toBeVisible()
    await expect(page.getByText("This pack's file replaces the harness answering.md.")).toBeVisible()
    await expect(row(lists(page).order, 'answering')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'answering prompt' })).toHaveValue(harness)
    await studio.saveAll()
    expect(studio.disk(own)).toBe(harness)

    const useHarness = page.getByRole('button', { name: 'Use harness version' })
    await expect(useHarness).toHaveAttribute('title', "Delete this pack's answering.md and use the harness file")
    await useHarness.click()
    await expect(page.getByText('Harness prompt: shared by every pack. Edits here change all of them.')).toBeVisible()
    await expect(page.locator('main').getByText('prompts/answering.md', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved answering.md' })).toBeVisible()
    expect(studio.disk(own)).toBe('')
    expect(studio.disk('prompts/answering.md')).toBe(harness)
  })

  test('a pack copy of a locked prompt is flagged and Delete file fixes it', async ({ page, studio }) => {
    writeFileSync(join(SANDBOX, PACK, 'prompts', 'boundaries.md'), '## My own boundaries\n')
    await studio.open('/prompts')
    const banner = page.getByRole('alert').filter({ hasText: 'The pack would not load' })
    await expect(banner.getByText(/boundaries\.md: boundaries\.md is a locked harness prompt/)).toBeVisible()
    const { others } = lists(page)
    await row(others, 'boundaries').click()
    await expect(page).toHaveURL(/\/prompts\/boundaries\.md\?file=/)
    await expect(
      page.getByText('The harness locks boundaries.md, so this pack cannot have its own. Delete this file.')
    ).toBeVisible()
    await page.reload()
    await expect(row(lists(page).others, 'boundaries')).toHaveAttribute('aria-current', 'true')
    await page.getByRole('button', { name: 'Delete file' }).click()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await expect(banner).toBeHidden()
    await studio.saveAll()
    expect(studio.disk(`${PACK}/prompts/boundaries.md`)).toBe('')
  })

  test('the error banner names the problem and Go to field opens the file', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const editor = page.getByRole('textbox', { name: 'intro prompt' })
    await editor.press('End')
    await editor.pressSequentially(' {{nope}}')
    const banner = page.getByRole('alert').filter({ hasText: 'The pack would not load' })
    await expect(banner.getByText('intro.md: unknown macro {{nope}}')).toBeVisible()
    await expect(editor).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await row(lists(page).order, 'who-you-are').click()
    await expect(banner.getByText('intro.md: unknown macro {{nope}}')).toBeVisible()
    await banner.getByRole('button', { name: 'Go to field' }).click()
    await expect(page).toHaveURL(/\/prompts\/intro\.md$/)
    await expect(page.getByRole('textbox', { name: 'intro prompt' })).toBeFocused()
    await editor.fill((await editor.inputValue()).replace(' {{nope}}', ''))
    await expect(banner).toBeHidden()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
  })

  test('a section with no file shows missing, Go to field finds it, and Create adds the file', async ({
    page,
    studio
  }) => {
    const path = join(SANDBOX, CHARACTER)
    writeFileSync(path, studio.disk(CHARACTER).replace('speech]', 'speech, ghost]'))
    await studio.open('/identity')
    await page
      .getByRole('navigation', { name: 'Studio' })
      .getByRole('link', { name: /^Prompts/ })
      .click()
    const banner = page.getByRole('alert').filter({ hasText: 'The pack would not load' })
    await expect(banner.getByText(/character\.yml › prompt\.system\[9\]: no prompt file "ghost\.md"/)).toBeVisible()
    await expect(row(lists(page).order, 'ghost')).toBeVisible()
    await banner.getByRole('button', { name: 'Go to field' }).click()
    await expect(page).toHaveURL(/\/prompts\/ghost\.md$/)
    await expect(page.getByText('No file for ghost.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Create prompts/ghost.md' }).click()
    await expect(page.getByRole('textbox', { name: 'ghost prompt' })).toHaveValue('## Ghost\n\n')
    await expect(row(lists(page).order, 'ghost')).toHaveText(/pack$/)
    await expect(banner).toBeHidden()
    await studio.saveAll()
    expect(studio.disk(`${PACK}/prompts/ghost.md`)).toBe('## Ghost\n\n')
  })

  test('Preview follows the mood, hour and memory choices and shows unsaved edits', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const preview = page.getByRole('complementary', { name: 'Preview' })
    const text = preview.locator('pre')
    const tokens = preview.getByText(/^[\d,]+ tokens · [\d,]+ cached$/)
    await expect(preview.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    await expect(text).toContainText('## Current Mood: Playful')
    await expect(preview.getByText('default', { exact: true })).toBeVisible()
    const firstCount = await tokens.textContent()

    await preview.getByRole('combobox', { name: 'Mood' }).click()
    await page.getByRole('option', { name: 'sleepy' }).click()
    await expect(text).toContainText('## Current Mood: Sleepy')
    await expect(text).not.toContainText('## Current Mood: Playful')
    await expect(preview.getByText('default', { exact: true })).toHaveCount(0)

    await preview.getByRole('combobox', { name: 'Hour' }).click()
    await page.getByRole('option', { name: '06:00' }).click()
    await expect(preview.getByText('early morning', { exact: true })).toBeVisible()
    await expect(text).toContainText("It's currently early morning")
    await preview.getByRole('combobox', { name: 'Hour' }).click()
    await page.getByRole('option', { name: '02:00' }).click()
    await expect(text).toContainText("It's currently late night")

    await preview.getByRole('combobox', { name: 'Memory' }).click()
    await page.getByRole('option', { name: 'None' }).click()
    await expect(preview.getByText('no memory, as /ask')).toBeVisible()
    await expect(text).not.toContainText('recall_user')
    await expect(tokens).not.toHaveText(firstCount ?? '')

    const editor = page.getByRole('textbox', { name: 'intro prompt' })
    await editor.press('End')
    await editor.pressSequentially(' PREVIEW-MARKER')
    await expect(text).toContainText('PREVIEW-MARKER')
  })

  test('the Markdown and Diff tabs show the draft and what changed', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const preview = page.getByRole('complementary', { name: 'Preview' })
    await preview.getByRole('tab', { name: 'Markdown' }).click()
    await expect(preview.locator('pre')).toHaveText(studio.disk(`${PACK}/prompts/intro.md`))
    await page.keyboard.press('ArrowRight')
    await expect(preview.getByRole('tab', { name: 'Diff' })).toBeFocused()
    await expect(preview.getByText('No unsaved changes in intro.md.')).toBeVisible()

    const editor = page.getByRole('textbox', { name: 'intro prompt' })
    await editor.press('End')
    await editor.press('Enter')
    await editor.pressSequentially('A new line.')
    const diff = preview.getByRole('table', { name: `Changes in ${PACK}/prompts/intro.md` })
    await expect(diff.getByRole('cell', { name: 'added' })).not.toHaveCount(0)
    await expect(diff.getByText('A new line.')).toBeVisible()
    await preview.getByRole('tab', { name: 'Markdown' }).click()
    await expect(preview.locator('pre')).toContainText('A new line.')
    await row(lists(page).order, 'who-you-are').click()
    await preview.getByRole('tab', { name: 'Diff' }).click()
    await expect(preview.getByText('No unsaved changes in who-you-are.md.')).toBeVisible()
  })
})
