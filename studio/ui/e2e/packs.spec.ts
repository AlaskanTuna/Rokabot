import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { REPO, SANDBOX, resetSandbox } from './sandbox'

const TOKEN = 'persona-studio-e2e-token-0123456789'
const ROKA = 'characters/roka'

/** config.yml's `character:` value for a sandbox pack: relative to the repo root, as the bot resolves it. */
const characterLine = (id: string) => `character: ${relative(REPO, join(SANDBOX, 'characters', id))}`

function removeRoka() {
  rmSync(join(SANDBOX, ROKA, 'character.yml'))
}

/** Copies Roka to characters/<id> with its own id, optionally breaking one line of character.yml. */
function copyPack(id: string, broken = false) {
  const dir = join(SANDBOX, 'characters', id)
  cpSync(join(SANDBOX, ROKA), dir, { recursive: true })
  const file = join(dir, 'character.yml')
  let text = readFileSync(file, 'utf8').replace(/^id: roka /m, `id: ${id} `)
  if (broken) text = text.replace(/^fullName: .*\n/m, '')
  writeFileSync(file, text)
}

async function openNoPack(page: Page) {
  await page.goto(`/prompts#token=${TOKEN}`)
  await expect(page.getByRole('heading', { name: 'No character pack found' })).toBeVisible()
}

test.describe('Character packs', () => {
  // The server keeps the pack it switched to, so every test hands Roka back for the specs that follow.
  test.afterEach(async ({ request }) => {
    resetSandbox(SANDBOX)
    const headers = { 'x-studio-token': TOKEN }
    const selected = await request.post('/api/pack/select', { headers, data: { dir: ROKA } })
    expect(selected.status()).toBe(200)
    const pack = await request.get('/api/pack', { headers })
    expect(pack.status()).toBe(200)
    expect((await pack.json()).dir).toBe(ROKA)
  })

  test('with no pack, the studio says so and Create from template checks the id', async ({ page, studio }) => {
    removeRoka()
    await openNoPack(page)
    await expect(
      page.getByText(`Persona Studio looked for ${ROKA} and found no folder with a character.yml.`)
    ).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Studio' })).toHaveCount(0)
    const choose = page.getByRole('button', { name: 'Choose a folder' })
    await expect(choose).toBeDisabled()
    await expect(choose).toHaveAttribute('title', 'No folder under characters/ has a character.yml yet')

    await page.getByRole('button', { name: 'Create from template' }).click()
    const id = page.getByRole('textbox', { name: 'Pack id' })
    const create = page.getByRole('button', { name: 'Create pack' })
    await expect(id).toBeFocused()
    await expect(id).toHaveAccessibleDescription('Creates characters/<id> from the template.')
    await expect(create).toBeDisabled()
    await id.fill('My Pack')
    await expect(id).toHaveAccessibleDescription('Use lowercase letters, digits and dashes.')
    await expect(create).toBeDisabled()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(id).toBeHidden()
    await page.getByRole('button', { name: 'Create from template' }).click()

    await id.fill('roka')
    await create.click()
    await expect(id).toHaveAccessibleDescription('characters/roka already exists; pick another id')
    await expect(id).toHaveAttribute('aria-invalid', 'true')
    await id.fill('e2e-pack')
    await expect(id).toHaveAccessibleDescription('Creates characters/e2e-pack from the template.')
    await id.press('Enter')

    const nav = page.getByRole('navigation', { name: 'Studio' })
    await expect(nav.getByText('characters/e2e-pack', { exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Created characters/e2e-pack' })).toContainText(
      'Restart the bot to apply.'
    )
    await expect(page.getByRole('heading', { level: 1, name: 'Prompts' })).toBeVisible()
    await expect(nav.getByRole('button', { name: /^e2e-pack/ })).toBeVisible()
    expect(studio.disk('config.yml')).toMatch(new RegExp(`^${characterLine('e2e-pack')}`, 'm'))
    expect(studio.disk('characters/e2e-pack/character.yml')).toMatch(/^id: e2e-pack /m)
  })

  test('Choose a folder switches to a pack that loads and names the problem in one that does not', async ({
    page,
    studio
  }) => {
    copyPack('broken', true)
    copyPack('other')
    removeRoka()
    await openNoPack(page)
    await page.getByRole('button', { name: 'Choose a folder' }).click()
    const folder = page.getByRole('combobox', { name: 'Pack folder' })
    await expect(folder).toHaveText('characters/broken')
    const use = page.getByRole('button', { name: 'Use this pack' })
    await use.click()
    await expect(folder).toHaveAccessibleDescription(
      'character.yml › fullName: Invalid input: expected string, received undefined'
    )
    await expect(page.getByRole('heading', { name: 'No character pack found' })).toBeVisible()
    const config = studio.disk('config.yml')

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(folder).toBeHidden()
    await page.getByRole('button', { name: 'Choose a folder' }).click()
    await expect(folder).not.toHaveAttribute('aria-invalid', 'true')
    await use.click()
    await expect(folder).toHaveAttribute('aria-invalid', 'true')
    await folder.click()
    await page.getByRole('option', { name: 'characters/other' }).click()
    await expect(folder).toHaveText('characters/other')
    await expect(folder).not.toHaveAttribute('aria-invalid', 'true')
    expect(studio.disk('config.yml')).toBe(config)
    await use.click()
    const nav = page.getByRole('navigation', { name: 'Studio' })
    await expect(nav.getByText('characters/other', { exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Using characters/other' })).toBeVisible()
    expect(studio.disk('config.yml')).toMatch(new RegExp(`^${characterLine('other')}`, 'm'))
  })

  test('the sidebar switcher waits for unsaved edits, asks first, then switches', async ({ page, studio }) => {
    copyPack('other')
    await studio.open('/prompts/intro.md')
    const nav = page.getByRole('navigation', { name: 'Studio' })
    const switcher = nav.getByRole('button', { name: 'roka · Maniwa Roka' })
    await expect(switcher).toHaveAttribute('aria-expanded', 'false')
    await switcher.click()
    const packs = nav.getByRole('listbox', { name: 'Character packs' })
    await expect(packs.getByRole('option', { name: ROKA })).toHaveAttribute('aria-selected', 'true')
    await expect(packs.getByRole('option', { name: 'characters/other' })).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('Escape')
    await expect(packs).toBeHidden()
    await switcher.click()
    await packs.getByRole('option', { name: ROKA }).click()
    await expect(packs).toBeHidden()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const editor = page.getByRole('textbox', { name: 'intro prompt' })
    await editor.fill(`${await editor.inputValue()}\nUnsaved.`)
    await switcher.click()
    await packs.getByRole('option', { name: 'characters/other' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Save or discard first' })).toContainText(
      'Switching packs drops unsaved edits, so save or discard them before you switch.'
    )
    await expect(page.getByRole('dialog', { name: /^Switch to/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Discard' }).click()
    await page
      .getByRole('dialog', { name: 'Discard 1 unsaved change?' })
      .getByRole('button', { name: 'Discard' })
      .click()

    await switcher.click()
    await packs.getByRole('option', { name: 'characters/other' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch to characters/other?' })
    await expect(dialog).toContainText(
      'The studio checks the pack loads, then sets character: in config.yml. The bot uses it after a restart.'
    )
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    const config = studio.disk('config.yml')

    await switcher.click()
    await packs.getByRole('option', { name: 'characters/other' }).click()
    await dialog.getByRole('button', { name: 'Switch pack' }).click()
    await expect(nav.getByText('characters/other', { exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'other · Maniwa Roka' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Character pack switched' })).toContainText(
      'config.yml now points at characters/other. Restart the bot to apply.'
    )
    expect(studio.disk('config.yml')).toBe(config.replace(/^character: \S+/m, characterLine('other')))
    await expect(page.getByRole('heading', { level: 1, name: 'Prompts' })).toBeVisible()
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
  })

  test('a switch the studio refuses says why in the dialog and keeps the current pack', async ({ page, studio }) => {
    copyPack('broken', true)
    await studio.open('/prompts')
    const nav = page.getByRole('navigation', { name: 'Studio' })
    const config = studio.disk('config.yml')
    const dialog = page.getByRole('dialog', { name: 'Switch to characters/broken?' })
    await nav.getByRole('button', { name: 'roka · Maniwa Roka' }).click()
    await nav.getByRole('option', { name: 'characters/broken' }).click()
    await dialog.getByRole('button', { name: 'Switch pack' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'Could not switch: character.yml › fullName: Invalid input: expected string, received undefined'
    )
    await expect(dialog.getByRole('button', { name: 'Switch pack' })).toBeEnabled()
    await expect(nav.getByText(ROKA, { exact: true })).toBeVisible()
    expect(studio.disk('config.yml')).toBe(config)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    writeFileSync(join(SANDBOX, '.env'), `${studio.disk('.env')}CHARACTER_DIR=${ROKA}\n`)
    await nav.getByRole('button', { name: 'roka · Maniwa Roka' }).click()
    await nav.getByRole('option', { name: 'characters/broken' }).click()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Switch pack' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'Could not switch: CHARACTER_DIR is set, and it outranks character: in config.yml; remove it from .env and the shell'
    )
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(studio.disk('config.yml')).toBe(config)
  })
})
