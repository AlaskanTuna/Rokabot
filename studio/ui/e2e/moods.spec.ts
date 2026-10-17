import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const PACK = 'characters/roka'
const MOODS = `${PACK}/moods.yml`
const KEYS = [
  'playful',
  'sincere',
  'domestic',
  'flustered',
  'curious',
  'annoyed',
  'tender',
  'confident',
  'nostalgic',
  'mischievous',
  'sleepy',
  'competitive'
]

function moodList(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Moods' })
  return { nav, list: nav.getByRole('list', { name: 'Moods' }) }
}

/** A mood's row button: its name, then an error mark and role badges, if any. */
const moodRow = (page: Page, key: string) =>
  moodList(page).list.getByRole('button', { name: new RegExp(`^${key}(,| |$)`) })

/** Every line of `after` appears in `before`, in order: the edit only cut lines. */
function expectOnlyCut(before: string, after: string) {
  const was = before.split('\n')
  let at = 0
  for (const line of after.split('\n')) {
    while (at < was.length && was[at] !== line) at++
    expect(at, `"${line}" is not an original line in order`).toBeLessThan(was.length)
    at++
  }
}

test.describe('Moods', () => {
  test('Detection rules edits the shared rules, and the role badges follow', async ({ page, studio }) => {
    const before = studio.disk(MOODS)
    await studio.open('/moods')
    const { nav } = moodList(page)
    const rules = nav.getByRole('button', { name: /^Detection rules/ })
    await expect(rules).toHaveAttribute('aria-current', 'true')
    await expect(rules).toHaveText(/11$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Detection rules' })).toBeVisible()
    await expect(moodRow(page, 'playful')).toHaveText(/default$/)
    await expect(moodRow(page, 'sincere')).toHaveText(/safe$/)
    await expect(moodRow(page, 'sleepy')).toHaveText(/late night$/)
    await expect(moodRow(page, 'curious')).toHaveText(/^curious$/)

    await page.getByRole('textbox', { name: 'Default', exact: true }).fill('curious')
    await expect(moodRow(page, 'curious')).toHaveText(/default$/)
    await expect(moodRow(page, 'playful')).toHaveText(/^playful$/)
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await studio.saveAll()
    const after = studio.disk(MOODS)
    expect(after).toBe(before.replace(/^default: playful /m, 'default: curious '))
  })

  test('Pairs and portraits opens from the list, keeps its address and saves an edit', async ({ page, studio }) => {
    await studio.open('/moods')
    const { nav } = moodList(page)
    await nav.getByRole('button', { name: 'Pairs and portraits' }).click()
    await expect(page).toHaveURL(/\/moods\?view=shared$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Pairs and portraits' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Mood pairs/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Portrait urls/ })).toBeVisible()
    await page.reload()
    await expect(moodList(page).nav.getByRole('button', { name: 'Pairs and portraits' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    const before = studio.disk(MOODS)
    await page.getByRole('textbox', { name: 'domestic:flustered', exact: true }).fill('A Cozy Big Panic')
    await studio.saveAll()
    expect(studio.disk(MOODS)).toBe(
      before.replace("'domestic:flustered': A Cozy Little Panic", "'domestic:flustered': A Cozy Big Panic")
    )
    await moodList(page)
      .nav.getByRole('button', { name: /^Detection rules/ })
      .click()
    await expect(page).toHaveURL(/\/moods$/)
  })

  test('every mood opens its prompt and settings, and Preview starts on it', async ({ page, studio }) => {
    await studio.open('/moods')
    const { list } = moodList(page)
    await expect(list.getByRole('button')).toHaveCount(KEYS.length)
    const preview = page.getByRole('complementary', { name: 'Preview' })
    for (const key of KEYS) {
      await moodRow(page, key).click()
      await expect(page).toHaveURL(new RegExp(`/moods/${key}$`))
      await expect(moodRow(page, key)).toHaveAttribute('aria-current', 'true')
      await expect(page.getByRole('heading', { level: 2, name: key, exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: `${key} mood prompt` })).toHaveValue(
        studio.disk(`${PACK}/prompts/moods/${key}.md`)
      )
      await expect(page.getByText(`moods.yml › moods.${key}`)).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Adjective', exact: true })).toBeVisible()
      await expect(preview.getByRole('combobox', { name: 'Mood' })).toHaveText(key)
    }
    await expect(preview.locator('pre')).toContainText('## Current Mood: Competitive')
  })

  test('a mood saves prompt and setting edits, and a bad setting is flagged on its row', async ({ page, studio }) => {
    await studio.open('/moods/curious')
    const prompt = page.getByRole('textbox', { name: 'curious mood prompt' })
    await prompt.press('Control+End')
    await prompt.pressSequentially('- Asks one follow-up question.\n')
    const color = page.getByRole('textbox', { name: 'Color', exact: true })
    await color.fill('teal')
    await expect(moodRow(page, 'curious')).toHaveText(/^curious, has errors$/)
    const banner = page.getByRole('alert').filter({ hasText: 'The pack would not load' })
    await expect(banner.getByText('moods.yml › moods.curious.color: expected a colour like "#ffb3d9"')).toBeVisible()
    await expect(color).toHaveAccessibleDescription('expected a colour like "#ffb3d9"')
    await expect(color).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await color.fill('#00aaaa')
    await expect(banner).toBeHidden()
    await expect(moodRow(page, 'curious')).toHaveText(/^curious$/)
    await page.getByRole('textbox', { name: 'Adjective', exact: true }).fill('nosy')
    await expect(page.locator('main header').getByText('2 unsaved files')).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(`${PACK}/prompts/moods/curious.md`)).toMatch(/- Asks one follow-up question\.\n$/)
    const moods = studio.disk(MOODS)
    expect(moods).toContain("    color: '#00aaaa'\n")
    expect(moods).toContain('    adjective: nosy\n')
  })

  test('Add mood checks the name, then creates its entry and prompt file', async ({ page, studio }) => {
    const before = studio.disk(MOODS)
    await studio.open('/moods')
    const { nav } = moodList(page)
    await nav.getByRole('button', { name: 'Add mood' }).click()
    const name = nav.getByRole('textbox', { name: 'Mood name' })
    const add = nav.getByRole('button', { name: 'Add', exact: true })
    await expect(name).toBeFocused()
    await expect(add).toBeDisabled()
    await expect(add).toHaveAttribute('title', 'Type a mood name first')
    await name.fill('9lives')
    await expect(nav.getByText('Start with a letter; use lowercase letters, digits and dashes.')).toBeVisible()
    await expect(add).toBeDisabled()
    await name.fill('Wistful')
    await expect(nav.getByText('Start with a letter; use lowercase letters, digits and dashes.')).toBeVisible()
    await name.fill('playful')
    await expect(nav.getByText('A mood with that name exists.')).toBeVisible()
    await expect(add).toBeDisabled()
    await name.press('Escape')
    await expect(name).toBeHidden()
    await nav.getByRole('button', { name: 'Add mood' }).click()
    await nav.getByRole('button', { name: 'Cancel' }).click()
    await expect(name).toBeHidden()

    await nav.getByRole('button', { name: 'Add mood' }).click()
    await name.fill('wistful')
    await expect(nav.getByText('Creates prompts/moods/<name>.md and a moods.yml entry', { exact: false })).toBeVisible()
    await add.click()
    await expect(page).toHaveURL(/\/moods\/wistful$/)
    await expect(moodRow(page, 'wistful')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('textbox', { name: 'wistful mood prompt' })).toHaveValue(
      '## Current Mood: Wistful\n- Describe how Roka sounds in this mood.\n'
    )
    await expect(page.getByRole('textbox', { name: 'Judge', exact: true })).toHaveValue(
      'Describe when the wistful mood fits.'
    )
    await expect(page.locator('main header').getByText('2 unsaved files')).toBeVisible()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await studio.saveAll()

    expect(studio.disk(`${PACK}/prompts/moods/wistful.md`)).toBe(
      '## Current Mood: Wistful\n- Describe how Roka sounds in this mood.\n'
    )
    const after = studio.disk(MOODS)
    const lines = after.split('\n')
    const start = lines.indexOf('  wistful:')
    expect(start).toBeGreaterThan(0)
    let end = start + 1
    while (lines[end]?.startsWith('    ')) end++
    expect(lines.slice(start + 1, end)).toEqual([
      '    faces: [happy, teasing, smug]',
      '    beats: { flirt: 0.55, oneesan: 0.25, drama: 0.3 }',
      '    judge: Describe when the wistful mood fits.',
      "    color: '#ffb3d9'",
      '    placeholder: https://placehold.co/80x80/FFB3D9/white?text=%E2%99%AA',
      '    portraits: [smile, cheerful, delighted, gentle_smile]',
      '    emoji: 🎈',
      '    adjective: wistful',
      '    season: A Wistful Season'
    ])
    expect([...lines.slice(0, start), ...lines.slice(end)].join('\n')).toBe(before)
    await page.reload()
    await expect(moodRow(page, 'wistful')).toBeVisible()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
  })

  test('Remove mood is blocked for a mood with a role or a voice.yml use, and says why', async ({ page, studio }) => {
    const cases: [string, string][] = [
      ['playful', 'playful is the default mood. Pick another one under Detection rules first.'],
      ['sincere', 'sincere is the safe mood. Pick another one under Detection rules first.'],
      ['sleepy', 'sleepy is the late night mood. Pick another one under Detection rules first.'],
      ['tender', /voice\.yml names tender in openers\.\w+\.skipMoods/.source]
    ]
    await studio.open('/moods')
    for (const [key, reason] of cases) {
      await moodRow(page, key).click()
      const remove = page.getByRole('button', { name: 'Remove mood' })
      await expect(remove).toBeDisabled()
      await expect(page.locator('main').getByText(new RegExp(reason))).toBeVisible()
      await expect(remove).toHaveAttribute('title', new RegExp(reason))
    }
    await expect(page.locator('main').getByText(/Remove it on the Voice screen first\.$/)).toBeVisible()
    await moodRow(page, 'domestic').click()
    await expect(page.getByRole('button', { name: 'Remove mood' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Remove mood' })).toHaveAttribute('title', 'Remove the domestic mood')
  })

  test('Remove mood asks first, Keep it keeps it, and a confirmed removal saves cleanly', async ({ page, studio }) => {
    const before = studio.disk(MOODS)
    await studio.open('/moods/curious')
    const remove = page.getByRole('button', { name: 'Remove mood' })
    await remove.click()
    const dialog = page.getByRole('dialog', { name: 'Remove the curious mood?' })
    await expect(
      dialog.getByText(
        'This removes its moods.yml entry, 1 detection rule, 2 season titles and curious.md. Nothing changes on disk until you save.'
      )
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep it' }).click()
    await expect(dialog).toBeHidden()
    await expect(remove).toBeFocused()
    await remove.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)

    await remove.click()
    await dialog.getByRole('button', { name: 'Remove mood' }).click()
    await expect(dialog).toBeHidden()
    const toast = page.getByRole('status').filter({ hasText: 'Removed the curious mood' })
    await expect(toast.getByText('Save to apply it, or Discard to bring the mood back.')).toBeVisible()
    await expect(page).toHaveURL(/\/moods\/playful$/)
    await expect(moodRow(page, 'curious')).toHaveCount(0)
    await expect(page.locator('main header').getByText('2 unsaved files')).toBeVisible()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()

    await page.getByRole('button', { name: 'Discard' }).click()
    await page
      .getByRole('dialog', { name: 'Discard 2 unsaved changes?' })
      .getByRole('button', { name: 'Discard' })
      .click()
    await expect(moodRow(page, 'curious')).toBeVisible()

    await moodRow(page, 'curious').click()
    await remove.click()
    await dialog.getByRole('button', { name: 'Remove mood' }).click()
    await studio.saveAll()
    const after = studio.disk(MOODS)
    expect(after).not.toContain('curious')
    expectOnlyCut(before, after)
    // The rule (14 lines), two season titles and the 11-line entry.
    expect(before.split('\n').length - after.split('\n').length).toBe(27)
    expect(studio.disk(`${PACK}/prompts/moods/curious.md`)).toBe('')
    await page.reload()
    await expect(moodRow(page, 'curious')).toHaveCount(0)
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
  })
})

test.describe('Moods with worst-case data', () => {
  test.use({ dataset: 'worst' })
  const WISTFUL = 'wistful-but-quietly-hopeful-after-closing-time'

  test('a long mood with every role keeps a readable name, and its badges wrap inside the row', async ({
    page,
    studio
  }) => {
    await studio.open('/moods')
    const button = moodRow(page, WISTFUL)
    await expect(button).toHaveText(/^wistful.*defaultsafelate night$/)
    const name = button.getByTitle(WISTFUL, { exact: true })
    const nameBox = await name.boundingBox()
    const rowBox = await button.boundingBox()
    if (!nameBox || !rowBox) throw new Error('the mood row is not rendered')
    expect(nameBox.width, 'the name keeps most of the row').toBeGreaterThan(rowBox.width * 0.6)
    for (const role of ['default', 'safe', 'late night']) {
      const box = await button.getByText(role, { exact: true }).boundingBox()
      if (!box) throw new Error(`the ${role} badge is not rendered`)
      expect(box.y, `${role} sits under the name`).toBeGreaterThanOrEqual(nameBox.y + nameBox.height)
      expect(box.x + box.width, `${role} stays inside the row`).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    }
  })
})
