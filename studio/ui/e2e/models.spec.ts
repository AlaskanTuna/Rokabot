import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const CONFIG = 'config.yml'

const role = (page: Page, name: 'Main model' | 'Fallback model') => page.getByRole('region', { name })
const roleSelect = (page: Page, name: 'Main model' | 'Fallback model') =>
  role(page, name).getByRole('combobox', { name: 'Model' })
const row = (page: Page, key: string) => page.locator(`[data-path="llm.models.${key}"]`)
const addForm = (page: Page) => page.getByRole('form', { name: 'Add an OpenAI-compatible model' })
const banner = (page: Page) => page.getByRole('alert').filter({ hasText: 'config.yml would not load' })

/** The lines of `after` that are not in `before`, and the reverse: every other line, comments included, must match. */
function lineDiff(before: string, after: string) {
  const old = before.split('\n')
  const now = after.split('\n')
  return { added: now.filter((line) => !old.includes(line)), removed: old.filter((line) => !now.includes(line)) }
}

test.describe('Models', () => {
  test('the main select picks a model by mouse and updates its key line', async ({ page, studio }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    await expect(roleSelect(page, 'Main model')).toHaveText('haiku · claude-haiku-5-5')
    await expect(role(page, 'Main model').getByText('anthropic · effort low · ANTHROPIC_API_KEY set')).toBeVisible()
    await expect(row(page, 'haiku').getByRole('button', { name: 'Remove haiku' })).toBeDisabled()

    await roleSelect(page, 'Main model').click()
    const list = page.getByRole('listbox')
    await expect(list.getByRole('option', { name: /^haiku/ })).toHaveAttribute('aria-selected', 'true')
    await list.getByRole('option', { name: /^sonnet/ }).click()
    await expect(list).toBeHidden()
    await expect(roleSelect(page, 'Main model')).toHaveText('sonnet · claude-sonnet-5-5')
    await expect(row(page, 'sonnet').getByRole('button', { name: 'Remove sonnet' })).toBeDisabled()
    await expect(row(page, 'haiku').getByRole('button', { name: 'Remove haiku' })).toBeEnabled()

    await roleSelect(page, 'Main model').click()
    await page.getByRole('listbox').getByRole('option', { name: /^luna/ }).click()
    const meta = role(page, 'Main model').getByText('openai · effort none · OPENAI_API_KEY missing')
    await expect(meta).toBeVisible()
    // The bot refuses to start without the key, so the banner offers Secrets as well as the field.
    await expect(banner(page)).toContainText(
      'Missing required environment variable: OPENAI_API_KEY (llm.main uses openai).'
    )
    await expect(role(page, 'Main model').getByRole('alert')).toHaveText(
      'Missing required environment variable: OPENAI_API_KEY (llm.main uses openai)'
    )
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(roleSelect(page, 'Main model')).toBeFocused()
    await banner(page).getByRole('button', { name: 'Open Secrets' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Secrets' })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('focus')).toBe('OPENAI_API_KEY')
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Models' })).toBeVisible()

    await roleSelect(page, 'Main model').click()
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /^sonnet/ })
      .click()
    await expect(banner(page)).toBeHidden()
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: ['  main: sonnet # Required; a key under llm.models (LLM_MAIN overrides)'],
      removed: ['  main: haiku # Required; a key under llm.models (LLM_MAIN overrides)']
    })
  })

  test('the main select works from the keyboard', async ({ page, studio }) => {
    await studio.open('/models')
    const select = roleSelect(page, 'Main model')
    await select.focus()
    await page.keyboard.press('ArrowDown')
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    await expect(select).toHaveAttribute('aria-expanded', 'true')
    const activeOption = async () =>
      page.locator(`[id="${await select.getAttribute('aria-activedescendant')}"]`).textContent()
    await expect.poll(activeOption).toMatch(/^haiku/)
    await page.keyboard.press('ArrowDown')
    await expect.poll(activeOption).toMatch(/^sonnet/)
    await page.keyboard.press('Enter')
    await expect(list).toBeHidden()
    await expect(select).toHaveText('sonnet · claude-sonnet-5-5')
    await expect(select).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await expect.poll(activeOption).toMatch(/^deepseek/)
    await page.keyboard.press('Escape')
    await expect(list).toBeHidden()
    await expect(select).toHaveText('sonnet · claude-sonnet-5-5')

    // Typeahead picks the next model whose name starts with the letter, and a second press moves on.
    await page.keyboard.press('q')
    await expect(select).toHaveText('qwen122 · Qwen/Qwen3.5-122B-A10B')
    await page.keyboard.press('q')
    await expect(select).toHaveText('qwen · Qwen/Qwen3.5-35B-A3B')
    await page.keyboard.press('h')
    await expect(select).toHaveText('haiku · claude-haiku-5-5')
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })

  test('fallback None removes the line and picking it again restores its comment', async ({ page, studio }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    await roleSelect(page, 'Fallback model').click()
    await page.getByRole('listbox').getByRole('option', { name: /^None/ }).click()
    await expect(roleSelect(page, 'Fallback model')).toHaveText('None')
    await expect(
      role(page, 'Fallback model').getByText('Off: when the main model fails, no other model answers.')
    ).toBeVisible()
    await expect(page.getByText('No fallback model is set, so these settings change nothing.')).toBeVisible()
    await expect(row(page, 'qwen122').getByRole('button', { name: 'Remove qwen122' })).toBeEnabled()
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: [],
      removed: [
        '  fallback: qwen122 # Optional; a key under llm.models (LLM_FALLBACK overrides; LLM_FALLBACK=none disables)'
      ]
    })

    await roleSelect(page, 'Fallback model').click()
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /^qwen122/ })
      .click()
    await expect(
      role(page, 'Fallback model').getByText(/^modelscope · MODELSCOPE_API_KEY set · 250 Magicubes a day$/)
    ).toBeVisible()
    await studio.saveAll()
    expect(studio.disk(CONFIG)).toBe(before)
  })

  test('the sticky toggle and the hedge field write their own lines and reject bad input', async ({ page, studio }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    const routing = page.getByRole('region', { name: 'Routing' })
    const sticky = routing.getByRole('switch', { name: /^Start replies on the fallback for 5 minutes/ })
    await expect(sticky).toHaveAttribute('aria-checked', 'true')
    await sticky.click()
    await expect(sticky).toHaveAttribute('aria-checked', 'false')

    const hedge = routing.getByRole('textbox', { name: 'Hedge after (ms)' })
    for (const bad of ['-5', '1.5', 'soon']) {
      await hedge.fill(bad)
      await expect(routing.getByText('Enter a whole number of milliseconds, 0 or more.')).toBeVisible()
      await expect(hedge).toHaveAttribute('aria-invalid', 'true')
    }
    await hedge.fill('2500')
    await expect(routing.getByText('Enter a whole number of milliseconds, 0 or more.')).toHaveCount(0)
    await expect(routing.getByText('0 turns hedging off.')).toBeVisible()
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: [
        '  hedgeAfterMs: 2500 # Start the same call on the fallback after this many ms; paid routes start at 0 (off)',
        '  stickyMs: 0 # After the main model fails and the fallback answers, later turns start on the fallback this long'
      ],
      removed: [
        '  hedgeAfterMs: 0 # Start the same call on the fallback after this many ms; paid routes start at 0 (off)',
        '  stickyMs: 300000 # After the main model fails and the fallback answers, later turns start on the fallback this long'
      ]
    })
  })

  test('a model row expands to edit its fields', async ({ page, studio }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    const expand = row(page, 'haiku').getByRole('button', { name: 'Edit the fields of haiku' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expand.click()
    const collapse = row(page, 'haiku').getByRole('button', { name: 'Hide the fields of haiku' })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await expect(row(page, 'haiku').getByRole('textbox', { name: 'Provider' })).toHaveValue('anthropic')
    await row(page, 'haiku').getByRole('textbox', { name: 'Effort' }).fill('none')
    await expect(role(page, 'Main model').getByText('anthropic · effort none · ANTHROPIC_API_KEY set')).toBeVisible()
    await collapse.click()
    await expect(row(page, 'haiku').getByRole('textbox', { name: 'Effort' })).toHaveCount(0)
    await studio.saveAll()
    expect(studio.disk(CONFIG)).toBe(
      before.replace(
        'haiku: { provider: anthropic, model: claude-haiku-5-5, effort: low }',
        'haiku: { provider: anthropic, model: claude-haiku-5-5, effort: none }'
      )
    )
  })

  test('a rejected model field shows on its row, and Go to field opens the row', async ({ page, studio }) => {
    await studio.open('/models')
    const haiku = row(page, 'haiku')
    await haiku.getByRole('button', { name: 'Edit the fields of haiku' }).click()
    const effort = haiku.getByRole('textbox', { name: 'Effort' })
    await effort.fill('extreme')
    const message =
      'Config value llm.models.haiku.effort must be one of none, low, medium, high, xhigh, max, got: extreme'
    await expect(haiku.getByRole('alert')).toHaveText(message)
    await expect(effort).toHaveAttribute('aria-invalid', 'true')
    await haiku.getByRole('button', { name: 'Hide the fields of haiku' }).click()
    // Folded away, the row itself still names the problem.
    await expect(haiku.getByRole('alert')).toHaveText(message)
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(effort).toBeFocused()
    await effort.fill('low')
    await expect(banner(page)).toBeHidden()
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })

  test('Test connection reports success and failure in the row', async ({ page, studio }) => {
    await studio.open('/models')
    const sent: unknown[] = []
    await page.route('**/api/models/test', async (route) => {
      sent.push(route.request().postDataJSON())
      await route.fulfill({
        json: {
          ok: true,
          status: 200,
          latencyMs: 42,
          message: 'Connected in 42 ms; claude-haiku-5-5 is listed.',
          modelListed: true
        }
      })
    })
    const haiku = row(page, 'haiku')
    await haiku.getByRole('button', { name: 'Test connection' }).click()
    await expect(haiku.getByRole('status')).toHaveText('Connected in 42 ms; claude-haiku-5-5 is listed.')
    expect(sent).toEqual([{ provider: 'anthropic', model: 'claude-haiku-5-5' }])

    await page.unroute('**/api/models/test')
    await page.route('**/api/models/test', (route) =>
      route.fulfill({
        json: {
          ok: false,
          status: 401,
          latencyMs: 80,
          message: 'The server answered 401: check MODELSCOPE_API_KEY.',
          modelListed: null
        }
      })
    )
    const qwen = row(page, 'qwen')
    await qwen.getByRole('button', { name: 'Test connection' }).click()
    await expect(qwen.getByRole('alert')).toHaveText('The server answered 401: check MODELSCOPE_API_KEY.')
    await expect(haiku.getByRole('status')).toHaveText('Connected in 42 ms; claude-haiku-5-5 is listed.')

    await page.unroute('**/api/models/test')
    await page.route('**/api/models/test', (route) => route.abort())
    await haiku.getByRole('button', { name: 'Test connection' }).click()
    await expect(haiku.getByRole('alert')).toHaveText(/^Persona Studio is not answering/)
  })

  test('a missing key is named, with a way to Secrets', async ({ page, studio }) => {
    await studio.open('/models')
    const luna = row(page, 'luna')
    await expect(luna.getByText('OPENAI_API_KEY missing')).toBeVisible()
    await luna.getByRole('button', { name: 'Test connection' }).click()
    await expect(luna.getByRole('alert')).toHaveText('OPENAI_API_KEY is not set in .env.')
    const toast = page
      .getByRole('alert')
      .filter({ hasText: 'OPENAI_API_KEY is not set' })
      .filter({ hasText: 'Open Secrets' })
    await expect(toast).toContainText('luna needs it to connect. Add it on Secrets, then test again.')
    await toast.getByRole('button', { name: 'Open Secrets' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Secrets' })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('focus')).toBe('OPENAI_API_KEY')
  })

  test('main and fallback cannot be removed; another model asks first', async ({ page, studio }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    for (const [key, reason] of [
      ['haiku', 'In use as the main model. Pick another main model first.'],
      ['qwen122', 'In use as the fallback model. Pick another fallback model first.']
    ]) {
      const remove = row(page, key).getByRole('button', { name: `Remove ${key}` })
      await expect(remove).toBeDisabled()
      await expect(remove).toHaveAccessibleDescription(reason)
    }

    const remove = row(page, 'sonnet').getByRole('button', { name: 'Remove sonnet' })
    await remove.click()
    const dialog = page.getByRole('dialog', { name: 'Remove sonnet?' })
    await expect(dialog).toContainText(
      'This deletes llm.models.sonnet from config.yml. Nothing changes on disk until you save.'
    )
    await dialog.getByRole('button', { name: 'Keep it' }).click()
    await expect(dialog).toBeHidden()
    await expect(row(page, 'sonnet')).toBeVisible()
    await expect(remove).toBeFocused()

    await remove.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await remove.click()
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(row(page, 'sonnet')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Removed sonnet' })).toContainText(
      'Save to keep the change.'
    )
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: [],
      removed: [
        "    sonnet: { provider: anthropic, model: claude-sonnet-5-5, effort: low } # Needs ANTHROPIC_API_KEY; 20x Haiku's price per token"
      ]
    })
  })

  test('Add model checks each field, focuses the first problem, and writes one line', async ({ page, studio }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    const add = addForm(page)
    const key = add.getByRole('textbox', { name: 'Key' })
    const model = add.getByRole('textbox', { name: 'Model' })
    const url = add.getByRole('textbox', { name: 'Base URL' })

    await add.getByRole('button', { name: 'Add model' }).click()
    await expect(add.getByText('Enter a key, such as local.')).toBeVisible()
    await expect(add.getByText('Enter the model id the server expects.')).toBeVisible()
    await expect(add.getByText('Enter the server base URL, such as http://localhost:11434/v1.')).toBeVisible()
    await expect(key).toBeFocused()

    await key.fill('9lives')
    await expect(add.getByText('Start with a letter, then use letters, digits, - or _.')).toBeVisible()
    await key.fill('haiku')
    await expect(add.getByText('llm.models already has haiku. Pick another key.')).toBeVisible()
    await key.fill('local')
    await model.fill('qwen3:32b')
    await url.fill('localhost:11434/v1')
    await add.getByRole('button', { name: 'Add model' }).click()
    await expect(add.getByText('Use an http:// or https:// URL.')).toBeVisible()
    await expect(url).toBeFocused()
    await url.fill('http://localhost:11434/v1')
    await expect(add.getByRole('alert')).toHaveCount(0)

    await add.getByRole('switch', { name: 'Tools' }).click()
    await add.getByRole('switch', { name: 'Vision' }).click()
    await add.getByRole('switch', { name: 'JSON schema output' }).click()
    await add.getByRole('combobox', { name: 'API key variable' }).click()
    await expect(page.getByRole('listbox').getByRole('option', { name: /^GEMINI_API_KEY/ })).toContainText(
      'not set in .env'
    )
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /^MODELSCOPE_API_KEY/ })
      .click()
    await add.getByRole('button', { name: 'Add model' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Added local' })).toContainText('Save to keep it.')
    await expect(key).toHaveValue('')
    await expect(add.getByRole('switch', { name: 'Tools' })).toHaveAttribute('aria-checked', 'true')
    await expect(row(page, 'local')).toContainText('openai-compatible')
    await expect(row(page, 'local').getByText('MODELSCOPE_API_KEY set')).toBeVisible()
    await roleSelect(page, 'Fallback model').click()
    await expect(page.getByRole('listbox').getByRole('option', { name: /^local/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await studio.saveAll()
    const deepseek = before.split('\n').find((line) => line.startsWith('    deepseek: ')) as string
    expect(studio.disk(CONFIG)).toBe(
      before.replace(
        deepseek,
        `${deepseek}\n    local: { provider: openai-compatible, model: 'qwen3:32b', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: MODELSCOPE_API_KEY, capabilities: { tools: false, vision: true, structuredOutput: json_schema } }`
      )
    )
  })

  test('Add model tests a server it cannot reach, for real', async ({ page, studio }) => {
    await studio.open('/models')
    const add = addForm(page)
    await add.getByRole('button', { name: 'Test connection' }).click()
    await expect(add.getByText('Enter the model id the server expects.')).toBeVisible()
    await expect(add.getByText('Enter a key, such as local.')).toHaveCount(0)
    await add.getByRole('textbox', { name: 'Model' }).fill('qwen3:32b')
    await add.getByRole('textbox', { name: 'Base URL' }).fill('http://127.0.0.1:9/v1')
    await add.getByRole('button', { name: 'Test connection' }).click()
    await expect(add.getByRole('alert')).toHaveText(/^Could not reach http:\/\/127\.0\.0\.1:9\/v1: .+\.$/)
    await expect(page.locator('main header').getByText('unsaved')).toHaveCount(0)
  })

  test('Advanced sections open, show allowed ranges, and point a rejected value at its field', async ({
    page,
    studio
  }) => {
    await studio.open('/models')
    const before = studio.disk(CONFIG)
    const gemini = page.locator('details[data-path="gemini"]')
    await expect(gemini).not.toHaveAttribute('open')
    await gemini.locator('summary').click()
    await expect(gemini).toHaveAttribute('open')
    const timeout = gemini.getByRole('textbox', { name: 'Timeout', exact: true })
    await expect(gemini.getByText(/second Gemini round.*turnDeadlineMs\)\. Allowed: 1 or more\.$/)).toBeVisible()
    await expect(
      gemini.getByText('Max retries for transient errors (429, 500, 503). Allowed: 0 or more.')
    ).toBeVisible()
    await expect(gemini.getByText(/Allowed: only 125,000 \(from gemini\.maxAttachmentTokens\)\.$/)).toBeVisible()

    await timeout.fill('0')
    await expect(banner(page)).toContainText('gemini › timeout must be >= 1, got: 0.')
    await expect(gemini.getByText('Config value gemini.timeout must be >= 1, got: 0')).toBeVisible()
    await expect(timeout).toHaveAttribute('aria-invalid', 'true')
    await expect(gemini.locator('summary')).toContainText('1 error')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await gemini.locator('summary').click()
    await expect(gemini).not.toHaveAttribute('open')
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(gemini).toHaveAttribute('open')
    await expect(timeout).toBeFocused()

    await timeout.fill('15000')
    await expect(banner(page)).toBeHidden()
    await page.locator('details[data-path="jev"] summary').click()
    await page.locator('details[data-path="jev"]').getByRole('textbox', { name: 'Tone', exact: true }).fill('shadow')
    await studio.saveAll()
    expect(lineDiff(before, studio.disk(CONFIG))).toEqual({
      added: [
        '  tone: shadow # off | shadow (ask Jev and log, change nothing) | on (Jev picks the tone)',
        expect.stringMatching(/^ {2}timeout: 15000 # API request timeout in ms/)
      ],
      removed: [
        '  tone: on # off | shadow (ask Jev and log, change nothing) | on (Jev picks the tone)',
        expect.stringMatching(/^ {2}timeout: 20000 # API request timeout in ms/)
      ]
    })
  })

  test('a Models error shown on another page sends Go to field back here', async ({ page, studio }) => {
    await studio.open('/models')
    await page.locator('details[data-path="fallback"] summary').click()
    await page.locator('details[data-path="fallback"]').getByRole('textbox', { name: 'Timeout (ms)' }).fill('0')
    await expect(banner(page)).toBeVisible()
    await page
      .getByRole('navigation', { name: 'Studio' })
      .getByRole('link', { name: /^Memory/ })
      .click()
    await expect(banner(page)).toContainText(
      'fallback › timeoutMs must be >= 1, got: 0. Fix it in Models, then save again.'
    )
    await banner(page).getByRole('button', { name: 'Go to field' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Models' })).toBeVisible()
    const field = page.locator('details[data-path="fallback"]').getByRole('textbox', { name: 'Timeout (ms)' })
    await expect(field).toBeFocused()
    await expect(field).toBeInViewport()
  })
})
