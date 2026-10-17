import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const FILE = 'characters/roka/voice.yml'

const form = (page: Page) => page.getByRole('tabpanel', { name: 'Form' })
const index = (page: Page) => page.getByRole('navigation', { name: 'On this page' })
const indexRow = (page: Page, name: string) =>
  index(page).getByRole('button', { name: new RegExp(`^${name}( \\d+ errors?)?$`) })
const at = (page: Page, path: string) => page.locator(`[data-path="${path}"]`)
const banner = (page: Page) => page.getByRole('alert').filter({ hasText: 'The pack would not load' })

test.describe('Voice', () => {
  test('the index opens nested groups and jumps to them', async ({ page, studio }) => {
    await studio.open('/voice')
    await expect(indexRow(page, 'quick')).toBeVisible()
    await expect(indexRow(page, 'comedy')).toHaveCount(0)
    await indexRow(page, 'openers').click()
    await expect(indexRow(page, 'openers')).toHaveAttribute('aria-current', 'location')
    await expect(indexRow(page, 'quick')).toHaveCount(0)
    await indexRow(page, 'comedy').click()
    await expect(indexRow(page, 'comedy')).toHaveAttribute('aria-current', 'location')
    await expect(at(page, 'openers.comedy').getByRole('heading', { name: /^Comedy/ })).toBeInViewport()
    await indexRow(page, 'note').click()
    await expect(indexRow(page, 'note')).toHaveAttribute('aria-current', 'location')
    await expect(form(page).getByRole('textbox', { name: 'Header' })).toBeInViewport()
  })

  test('a record entry is named, checked, added and removed', async ({ page, studio }) => {
    await studio.open('/voice')
    const before = studio.disk(FILE)
    const faces = at(page, 'faces')
    await faces.getByRole('button', { name: 'Add faces entry' }).click()
    const name = faces.getByRole('textbox', { name: 'New entry name' })
    const add = faces.getByRole('button', { name: 'Add', exact: true })
    await expect(name).toBeFocused()
    await expect(add).toBeDisabled()
    await name.fill('sleepy face')
    await expect(faces.getByText('Letters, digits, dashes and underscores.')).toBeVisible()
    await expect(add).toBeDisabled()
    await name.fill('happy')
    await expect(faces.getByText('That name is taken.')).toBeVisible()
    await faces.getByRole('button', { name: 'Cancel' }).click()
    await expect(name).toHaveCount(0)

    await faces.getByRole('button', { name: 'Add faces entry' }).click()
    await name.fill('sleepy')
    await name.press('Enter')
    const sleepy = at(page, 'faces.sleepy')
    await expect(sleepy.getByRole('heading', { name: /^Sleepy/ })).toBeVisible()
    // An empty face group is a pool with nothing to draw, so the bot refuses it until it has a face.
    await expect(sleepy.getByRole('alert')).toHaveText('Add at least one item.')
    await expect(banner(page)).toContainText('voice.yml › faces › sleepy: Add at least one item.')
    await sleepy.getByRole('button', { name: 'Add value' }).click()
    await sleepy.getByRole('textbox', { name: 'Sleepy 1' }).fill('(-_-)zzz')
    await expect(banner(page)).toBeHidden()
    await studio.saveAll()
    const furious = before.split('\n').find((line) => line.startsWith('  furious: ')) as string
    expect(studio.disk(FILE)).toBe(before.replace(furious, `${furious}\n  sleepy: [(-_-)zzz]`))

    await sleepy.getByRole('button', { name: 'Remove Sleepy' }).click()
    await expect(sleepy).toHaveCount(0)
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(before)
  })

  test('a toggle writes true or false and nothing else', async ({ page, studio }) => {
    await studio.open('/voice')
    const before = studio.disk(FILE)
    const toggle = at(page, 'openers.particle.skipOnHardLine').getByRole('switch', { name: 'Skip on hard line' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await studio.saveAll()
    const after = studio.disk(FILE)
    expect(after.split('\n').filter((line, number) => line !== before.split('\n')[number])).toEqual([
      '    skipOnHardLine: false'
    ])
    await toggle.press('Space')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(before)
  })

  test('an unknown face group is marked on its item, with Go to field and Go to line', async ({ page, studio }) => {
    await studio.open('/voice')
    const groups = at(page, 'hardLineFaces')
    const second = groups.getByRole('textbox', { name: 'Hard line faces 2' })
    await second.fill('angry')
    await expect(at(page, 'hardLineFaces[1]').getByRole('alert')).toHaveText('unknown face group "angry"')
    await expect(second).toHaveAttribute('aria-invalid', 'true')
    await expect(banner(page)).toContainText('voice.yml › hardLineFaces[1]: unknown face group "angry"')
    await expect(indexRow(page, 'hardLineFaces')).toHaveAccessibleName('hardLineFaces 1 error')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await indexRow(page, 'paragraphs').click()
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(second).toBeFocused()
    await expect(second).toBeInViewport()

    await page.getByRole('tab', { name: 'YAML' }).first().click()
    const source = page.getByRole('textbox', { name: 'voice.yml source' })
    const line = (await source.inputValue()).split('\n').findIndex((text) => text.startsWith('hardLineFaces:')) + 1
    await banner(page)
      .getByRole('button', { name: `Go to line ${line}` })
      .click()
    await expect(source).toBeFocused()
    expect(
      await source.evaluate((area: HTMLTextAreaElement) => area.value.slice(area.selectionStart, area.selectionEnd))
    ).toBe('hardLineFaces: [furious, angry]')
    await page.getByRole('tab', { name: 'Form' }).click()
    await second.fill('pouty')
    await expect(banner(page)).toBeHidden()
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })

  test('an emptied pool says what to do, and a value brings it back', async ({ page, studio }) => {
    await studio.open('/voice')
    const before = studio.disk(FILE)
    const groups = at(page, 'hardLineFaces')
    await groups.getByRole('button', { name: 'Remove item 2' }).click()
    await groups.getByRole('button', { name: 'Remove item 1' }).click()
    await expect(groups.getByRole('textbox')).toHaveCount(0)
    await expect(groups.getByRole('alert')).toHaveText('Add at least one item.')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await groups.getByRole('button', { name: 'Add value' }).click()
    await groups.getByRole('textbox', { name: 'Hard line faces 1' }).fill('furious')
    await expect(banner(page)).toBeHidden()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(before.replace('hardLineFaces: [furious, pouty]', 'hardLineFaces: [furious]'))
  })

  test('a weight takes only numbers and its list adds and removes rows', async ({ page, studio }) => {
    await studio.open('/voice')
    const before = studio.disk(FILE)
    const quick = at(page, 'paragraphs.quick')
    const weight = at(page, 'paragraphs.quick[0]').getByRole('textbox', { name: 'Weight' })
    await weight.fill('most')
    await expect(quick.getByText('Enter a number.')).toBeVisible()
    await weight.fill('0.6')
    await expect(quick.getByText('Enter a number.')).toHaveCount(0)
    await quick.getByRole('button', { name: 'Add item' }).click()
    const added = at(page, 'paragraphs.quick[2]')
    await expect(added.getByRole('textbox', { name: 'Count' })).toHaveValue('0')
    await added.getByRole('textbox', { name: 'Count' }).fill('3')
    await added.getByRole('textbox', { name: 'Weight' }).fill('0.05')
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(
      before.replace(
        'quick: [{ count: 1, weight: 0.65 }, { count: 2, weight: 0.35 }]',
        'quick: [{ count: 1, weight: 0.6 }, { count: 2, weight: 0.35 }, { count: 3, weight: 0.05 }]'
      )
    )
    await added.getByRole('button', { name: 'Remove Item 3' }).click()
    await expect(added).toHaveCount(0)
    await weight.fill('0.65')
    await studio.saveAll()
    expect(studio.disk(FILE)).toBe(before)
  })

  test('the right column shows the closing note, the YAML and the diff', async ({ page, studio }) => {
    await studio.open('/voice')
    const aside = page.getByRole('complementary', { name: 'Preview' })
    await expect(aside.getByText(/## Speech Patterns/)).toBeVisible()
    await aside.getByRole('tab', { name: 'YAML' }).click()
    await expect(aside.getByText(/^# Roka's reply-shape dice/)).toBeVisible()
    await at(page, 'lengths').getByRole('textbox', { name: '1', exact: true }).fill('one tiny paragraph.')
    await aside.getByRole('tab', { name: 'Diff' }).click()
    const diff = aside.getByRole('table', { name: `Changes in ${FILE}` })
    await expect(
      diff.getByRole('row').filter({ has: page.getByRole('cell', { name: 'added', exact: true }) })
    ).toHaveText(/1: one tiny paragraph\./)
    await expect(
      diff.getByRole('row').filter({ has: page.getByRole('cell', { name: 'removed', exact: true }) })
    ).toHaveText(/1: one short paragraph, a few quick sentences\./)
  })
})
