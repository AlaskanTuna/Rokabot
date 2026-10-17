import { expect, test } from './fixtures'

const INTRO = 'characters/roka/prompts/intro.md'

test.describe('Saving, discarding and errors', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('an edit raises the unsaved state, and Review diff shows it', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const editor = page.getByRole('textbox', { name: /intro prompt/i })
    await editor.press('End')
    await editor.pressSequentially(' Extra line.')
    const header = page.locator('main header')
    await expect(header.getByText('1 unsaved file')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await page.getByRole('button', { name: /Notifications, 1 unread/ }).click()
    const panel = page.getByRole('dialog', { name: 'Notifications' })
    await expect(panel.getByText('Unsaved changes')).toBeVisible()
    await expect(panel.getByText('intro.md has edits since your last save.')).toBeVisible()
    await panel.getByRole('button', { name: 'Review diff' }).click()
    await expect(panel).toBeHidden()
    const diff = page.getByRole('table', { name: `Changes in ${INTRO}` })
    await expect(diff).toBeVisible()
    await expect(diff.getByRole('cell', { name: 'added' })).not.toHaveCount(0)
  })

  test('Discard asks first, Keep editing keeps the edit, Discard restores the file', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const editor = page.getByRole('textbox', { name: /intro prompt/i })
    const original = await editor.inputValue()
    await editor.fill(`${original}\nTemporary.`)
    await page.getByRole('button', { name: 'Discard' }).click()
    const dialog = page.getByRole('dialog', { name: 'Discard 1 unsaved change?' })
    await expect(dialog.getByText('intro.md')).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep editing' }).click()
    await expect(dialog).toBeHidden()
    await expect(editor).toHaveValue(`${original}\nTemporary.`)
    await page.getByRole('button', { name: 'Discard' }).click()
    await page
      .getByRole('dialog', { name: 'Discard 1 unsaved change?' })
      .getByRole('button', { name: 'Discard' })
      .click()
    await expect(editor).toHaveValue(original)
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(studio.disk(INTRO)).toBe(original)
  })

  test('Ctrl S saves to disk, then offers the restart command', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const editor = page.getByRole('textbox', { name: /intro prompt/i })
    const original = await editor.inputValue()
    await editor.fill(`${original}\nSaved by e2e.`)
    await page.keyboard.press('Control+s')
    const toast = page.getByRole('status').filter({ hasText: 'Saved intro.md' })
    await expect(toast).toBeVisible()
    await expect(toast.getByText('Restart the bot to apply.')).toBeVisible()
    expect(studio.disk(INTRO)).toBe(`${original}\nSaved by e2e.`)
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
    await toast.getByRole('button', { name: 'Copy restart command' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('docker compose restart roka')
    await page.getByRole('button', { name: /Notifications/ }).click()
    const panel = page.getByRole('dialog', { name: 'Notifications' })
    await expect(panel.getByText('Restart to apply')).toBeVisible()
    await expect(panel.getByText('Unsaved changes')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Mark all read' }).click()
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
  })

  test('a lost connection keeps the edit and offers Retry', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const editor = page.getByRole('textbox', { name: /intro prompt/i })
    const original = await editor.inputValue()
    await editor.fill(`${original}\nOffline edit.`)
    await page.route('**/api/pack/files', (route) => route.abort())
    await page.getByRole('button', { name: 'Save changes' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'Not saved' })
    await expect(alert).toBeVisible()
    await expect(alert.getByText(/not answering/)).toBeVisible()
    await expect(editor).toHaveValue(`${original}\nOffline edit.`)
    expect(studio.disk(INTRO)).toBe(original)
    await page.unroute('**/api/pack/files')
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved intro.md' })).toBeVisible()
    expect(studio.disk(INTRO)).toBe(`${original}\nOffline edit.`)
  })

  test('a save the bot rejects names the error and jumps to it', async ({ page, studio }) => {
    await studio.open('/prompts/intro.md')
    const editor = page.getByRole('textbox', { name: /intro prompt/i })
    await editor.fill('Rejected.')
    await page.route('**/api/pack/files', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { file: 'characters/roka/moods.yml', path: 'default', message: 'must name a mood' },
          problems: [{ file: 'characters/roka/moods.yml', path: 'default', message: 'must name a mood' }]
        })
      })
    )
    await page.getByRole('button', { name: 'Save changes' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'Not saved: 1 error' })
    await expect(alert.getByText('moods.yml › default: must name a mood')).toBeVisible()
    await alert.getByRole('button', { name: 'Go to field' }).click()
    await expect(page).toHaveURL(/\/moods\?focus=default/)
    await expect(page.getByRole('heading', { level: 1, name: 'Moods' })).toBeVisible()
  })

  test('a live check failure blocks Save and points at the field', async ({ page, studio }) => {
    await studio.open('/moods')
    await page
      .getByRole('button', { name: /Detection rules/ })
      .first()
      .click()
    const field = page.getByRole('textbox', { name: 'Default', exact: true })
    await field.fill('not-a-mood')
    await expect(page.locator('main header').getByText(/\d+ errors?/)).toBeVisible()
    await expect(page.getByText('The pack would not load')).toBeVisible()
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await expect(save).toHaveAttribute('title', /Fix \d+ errors? before saving/)
    await field.fill('playful')
    await expect(page.locator('main header').getByText('Valid')).toBeVisible()
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })
})
