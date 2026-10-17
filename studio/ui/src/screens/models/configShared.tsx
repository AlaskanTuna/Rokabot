import { diffLines } from 'diff'
import { ChevronRight, KeyRound, TriangleAlert } from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { type Node, type Pair, type Scalar, isMap } from 'yaml'
import { DiffView } from '../../components/editor/DiffView'
import { FOCUS_ORDER, YamlForm } from '../../components/form/YamlForm'
import { Page } from '../../components/shell/Page'
import { Button } from '../../components/ui/Button'
import type { Problem } from '../../lib/api'
import { type Route, href, navigate, useLocation } from '../../lib/router'
import { readYaml, splitPath } from '../../lib/yaml'
import type { Path } from '../../lib/yamlEdit'
import { configRoute, fileName, setConfigDraft, useWorkspace } from '../../state/workspace'
import { readDoc } from './textEdit'

export interface ModelEntry {
  provider?: string
  model?: string
  effort?: string
  baseUrl?: string
  apiKeyEnv?: string
  [key: string]: unknown
}

export interface ConfigData {
  llm?: {
    main?: string
    fallback?: string | null
    hedgeAfterMs?: number
    stickyMs?: number
    modelscopeDailyMagicubes?: number
    models?: Record<string, ModelEntry | null>
    [key: string]: unknown
  }
  fallback?: { baseUrl?: string }
  [key: string]: unknown
}

const SCREEN_TITLES: Partial<Record<Route, string>> = {
  models: 'Models',
  memory: 'Memory',
  limits: 'Limits',
  discord: 'Discord'
}

type Limit = number | { path: string; offset?: number; fallback: number }

interface Bound {
  path: string
  min: Limit
  max?: Limit
}

/**
 * Mirrored from NUMERIC_BOUNDS in src/config.ts, keyed by the config.yml path (session.ttl, not session.ttlMs); keep the
 * two in step. Derived limits name the key they come from. `*` matches any key at that level.
 */
const BOUNDS: Bound[] = [
  { path: 'jev.timeoutMs', min: 1 },
  { path: 'jev.memoryTimeoutMs', min: 1 },
  { path: 'fallback.timeoutMs', min: 1 },
  { path: 'fallback.stickyMs', min: 0 },
  { path: 'jev.toneMinProbability', min: 0, max: 1 },
  { path: 'jev.prefetchMinNoul', min: 0, max: 1 },
  { path: 'jev.prefetchWaitMs', min: 0 },
  { path: 'jev.referentMinConfidence', min: 0, max: 1 },
  { path: 'gemini.timeout', min: 1 },
  { path: 'socialPosts.maxLookupsPerTurn', min: 1, max: 1 },
  { path: 'socialPosts.timeoutMs', min: 1, max: 30_000 },
  { path: 'socialPosts.maxTextChars', min: 1, max: 10_000 },
  { path: 'socialPosts.cacheTtlMs', min: 0 },
  { path: 'socialPosts.maxCacheEntries', min: 1, max: 10_000 },
  { path: 'socialPosts.maxReplies', min: 1, max: 10 },
  { path: 'socialPosts.maxRepliesOnRequest', min: 1, max: 50 },
  { path: 'socialPosts.maxReplyChars', min: 40, max: 1000 },
  { path: 'media.watchTimeoutMs', min: 5000, max: 60_000 },
  { path: 'media.digestMaxOutputTokens', min: 400, max: 4000 },
  { path: 'media.skimClips', min: 3, max: 9 },
  { path: 'media.skimClipSeconds', min: 2, max: 30 },
  { path: 'media.maxStreamedUploadBytes', min: 10_485_760, max: 104_857_600 },
  { path: 'media.uploadTimeoutMs', min: 10_000, max: 120_000 },
  { path: 'media.qwen.secondsPerFrame', min: 0.5, max: 30 },
  { path: 'media.qwen.minFrames', min: 4, max: 32 },
  { path: 'media.qwen.maxFrames', min: 4, max: 32 },
  { path: 'media.qwen.frameHeight', min: 144, max: 720 },
  { path: 'media.qwen.timeoutMs', min: 5000, max: 90_000 },
  { path: 'media.transcriber.timeoutMs', min: 5000, max: 120_000 },
  { path: 'media.transcriber.maxSpeechSec', min: 10, max: 600 },
  { path: 'media.transcriber.maxAudioSec', min: 30, max: 900 },
  { path: 'gemini.maxOutputTokens', min: 1 },
  { path: 'gemini.maxAttachmentTokens', min: 10_890, max: 125_000 },
  {
    path: 'gemini.maxTokensPerMinute',
    min: { path: 'gemini.maxAttachmentTokens', fallback: 125_000 },
    max: 125_000
  },
  { path: 'gemini.turnDeadlineMs', min: 1 },
  { path: 'gemini.retryBackoffCapMs', min: 1 },
  { path: 'gemini.maxRetries', min: 0 },
  { path: 'gemini.liveMaxRetries', min: 0 },
  { path: 'gemini.retryBackoffBaseMs', min: 0 },
  { path: 'gemini.retryRpmFloor', min: 0 },
  { path: 'gemini.maxLlmCalls', min: 1 },
  { path: 'gemini.hedgeAfterMs', min: 0 },
  { path: 'rateLimit.rpm', min: { path: 'gemini.maxLlmCalls', fallback: 4 } },
  { path: 'rateLimit.rpd', min: 1 },
  { path: 'llm.modelscopeDailyMagicubes', min: 1 },
  { path: 'session.ttl', min: 1 },
  { path: 'session.windowSize', min: 1 },
  { path: 'session.maxRehydrationAge', min: 0 },
  { path: 'session.historyRetentionDays', min: 1 },
  { path: 'discord.maxMessageLength', min: 1, max: 3927 },
  { path: 'discord.maxAttachmentBytesPerTurn', min: 10_485_760, max: 31_457_280 },
  { path: 'discord.maxInFlightAttachmentBytes', min: 31_457_280 },
  { path: 'embeddings.timeoutMs', min: 1 },
  { path: 'embeddings.backfillBatchSize', min: 1, max: 100_000 },
  { path: 'embeddings.backfillGapMs', min: 0, max: 60_000 },
  { path: 'memory.bufferSize', min: 1 },
  { path: 'memory.contextSize', min: 1 },
  { path: 'memory.channelMonitorTtlMs', min: 1 },
  { path: 'memory.maxClaimsPerTurn', min: 1 },
  { path: 'memory.retrievalTokenBudget', min: 1 },
  { path: 'memory.guildFactsTokenBudget', min: 0 },
  { path: 'memory.recentParticipantLimit', min: 1 },
  { path: 'memory.speakerMinShare', min: 0, max: 1 },
  { path: 'memory.maxActiveClaimsPerUser', min: 1 },
  { path: 'memory.stableClaimRetentionDays', min: 1 },
  { path: 'memory.claimRetentionDays', min: 1 },
  { path: 'memory.failedExtractionRetentionDays', min: 1 },
  { path: 'memory.transientClaimRetentionDays', min: 1 },
  { path: 'memory.deadClaimRetentionDays', min: 1 },
  { path: 'memory.salienceHalfLifeDays', min: 1 },
  { path: 'memory.recallCooldownMs', min: 0 },
  { path: 'memory.episodeLullMs', min: 1 },
  { path: 'memory.episodeMaxMessages', min: 1, max: { path: 'memory.bufferSize', offset: -3, fallback: 27 } },
  { path: 'memory.admitThreshold', min: 0, max: 1 },
  { path: 'memory.verifyThreshold', min: 0, max: 1 },
  { path: 'memory.modelAdmitThreshold', min: 0, max: 1 },
  { path: 'memory.modelVerifyThreshold', min: 0, max: 1 },
  { path: 'memory.episodeRecallK', min: 1, max: 10 },
  { path: 'memory.episodeTokenBudget', min: 1 },
  { path: 'memory.episodeMinSimilarity', min: 0, max: 1 },
  { path: 'memory.episodeRetentionDays', min: 1 },
  { path: 'memory.mediaRecallK', min: 0, max: 5 },
  { path: 'memory.mediaTokenBudget', min: 100, max: 1500 },
  { path: 'memory.mediaMinSimilarity', min: 0, max: 1 },
  { path: 'memory.mediaRetentionDays', min: 1, max: 365 },
  { path: 'memory.embeddingTimeoutMs', min: 1 },
  { path: 'memory.recallTokenBudget', min: 200, max: 2000 },
  { path: 'memory.recallCoreFacts', min: 0, max: 5 },
  { path: 'memory.factMinSimilarity', min: 0, max: 1 },
  { path: 'memory.serverFactMinSimilarity', min: 0, max: 1 },
  { path: 'memory.extractionSampleRate', min: 0, max: 1 },
  { path: 'memory.extractionSampleDays', min: 1, max: 90 },
  { path: 'memory.reclassifyMaxPerRun', min: 0, max: 100 },
  { path: 'metrics.retentionDays', min: 1 },
  { path: 'metrics.diagnosticsRetentionHours', min: 1 },
  { path: 'report.maxPerUserPerHour', min: 1 },
  { path: 'report.maxAttachmentBytes', min: 1 },
  { path: 'report.historyMessages', min: 1 },
  { path: 'report.historyMaxAgeMs', min: 0 },
  { path: 'emoji.probability', min: 0, max: 1 },
  { path: 'emoji.cooldownMs', min: 0 },
  { path: 'reminders.checkIntervalMs', min: 1 },
  { path: 'reminders.maxPerUser', min: 1 },
  { path: 'reminders.staleThresholdMs', min: 1 },
  { path: 'games.hangmanLives', min: 1 },
  { path: 'games.hangmanTimeoutMs', min: 1 },
  { path: 'games.shiritoriTimeoutMs', min: 1 },
  { path: 'games.shinyChance', min: 0, max: 1 },
  { path: 'statusCycleMs', min: 1 },
  { path: 'updates.checkIntervalHours', min: 1, max: 168 },
  { path: 'llm.hedgeAfterMs', min: 0 },
  { path: 'llm.stickyMs', min: 0 },
  { path: 'llm.monthlyBudgetUsd.*', min: 0 }
]

/** The bot names a few values by their resolved name; the user edits them under another key. */
const ALIASES: Record<string, string> = {
  'session.ttlMs': 'session.ttl',
  'memory.embeddingTimeoutMs': 'embeddings.timeoutMs'
}

function lookup(data: unknown, path: string): unknown {
  return splitPath(path).reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined),
    data
  )
}

function limitValue(limit: Limit, data: unknown): { value: number; from?: string } {
  if (typeof limit === 'number') return { value: limit }
  const found = lookup(data, limit.path)
  const base = typeof found === 'number' && Number.isFinite(found) ? found : limit.fallback
  return { value: base + (limit.offset ?? 0), from: limit.path }
}

const number = (value: number) => value.toLocaleString('en-US')

function boundText(bound: Bound, data: unknown): string {
  const min = limitValue(bound.min, data)
  const max = bound.max === undefined ? undefined : limitValue(bound.max, data)
  const source = [min.from, max?.from].filter(Boolean).join(', ')
  const range = !max
    ? `${number(min.value)} or more`
    : max.value === min.value
      ? `only ${number(min.value)}`
      : `${number(min.value)} to ${number(max.value)}`
  return `Allowed: ${range}${source ? ` (from ${source})` : ''}.`
}

function expandBounds(data: unknown): Bound[] {
  return BOUNDS.flatMap((bound) => {
    if (!bound.path.endsWith('.*')) return [bound]
    const parent = bound.path.slice(0, -2)
    const node = lookup(data, parent)
    return node && typeof node === 'object'
      ? Object.keys(node).map((key) => ({ ...bound, path: `${parent}.${key}` }))
      : []
  })
}

/** Each NUMERIC_BOUNDS range as help text, keyed by the field's dotted path. */
function boundHints(data: unknown): Record<string, string> {
  return Object.fromEntries(expandBounds(data).map((bound) => [bound.path, boundText(bound, data)]))
}

/** A config problem with its path moved to the key the user edits, so it lands on a field. */
export function normalizeProblem(problem: Problem | null, data: ConfigData | undefined): Problem | null {
  if (!problem) return null
  let path = problem.path
  if (path) {
    path = ALIASES[path] ?? path
    const role = /^llm\.(main|fallback)\.(.+)$/.exec(path)
    const key = role ? data?.llm?.[role[1] as 'main' | 'fallback'] : undefined
    if (role && typeof key === 'string') path = `llm.models.${key}.${role[2]}`
  } else {
    const role =
      /\(llm\.(main|fallback) uses /.exec(problem.message)?.[1] ??
      /^Environment variable LLM_(MAIN|FALLBACK)\b/.exec(problem.message)?.[1]?.toLowerCase()
    if (role) path = `llm.${role}`
  }
  return path === problem.path ? problem : { ...problem, path }
}

export function normalizePath(path: string | null, data: ConfigData | undefined): string | null {
  return path ? (normalizeProblem({ file: null, path, message: '' }, data)?.path ?? path) : null
}

/** What every config screen reads: the draft, its parsed data, the bot's problem and the field to focus. */
export function useConfig() {
  const workspace = useWorkspace()
  const { search } = useLocation()
  const text = workspace.config?.draft ?? ''
  const data = useMemo(() => readYaml(text) as ConfigData | undefined, [text])
  const problem = useMemo(() => normalizeProblem(workspace.configProblem, data), [workspace.configProblem, data])
  const file = search.get('file')
  const focusParam = !file || file === workspace.config?.path ? search.get('focus') : null
  const focus = useMemo(() => normalizePath(focusParam, data), [focusParam, data])
  return { text, data, path: workspace.config?.path ?? 'config.yml', problem, focus }
}

function within(focus: string | null, prefixes: string[]): boolean {
  return Boolean(
    focus &&
      prefixes.some((prefix) => focus === prefix || focus.startsWith(`${prefix}.`) || focus.startsWith(`${prefix}[`))
  )
}

interface ConfigFormProps {
  root?: Path
  order?: string[]
  only?: boolean
  exclude?: string[]
  readOnly?: boolean
  records?: string[]
}

/**
 * YamlForm over the config.yml draft, with the bot's problem on its field and NUMERIC_BOUNDS ranges as help. The page
 * focuses fields itself (useReveal), so YamlForm gets no focusPath and never scrolls the page island.
 */
export function ConfigForm({ root = [], order = [], only = false, exclude = [], readOnly, records }: ConfigFormProps) {
  const { text, data, problem } = useConfig()
  const hints = useMemo(() => boundHints(data), [data])
  return (
    <YamlForm
      text={text}
      onChange={setConfigDraft}
      hints={hints}
      root={root}
      order={order}
      only={only}
      exclude={exclude}
      readOnly={readOnly}
      records={records}
      problems={problem ? [problem] : []}
    />
  )
}

/**
 * Scrolls only the nearest scrolling ancestor; scrollIntoView would also shift the page island, whose overflow is
 * hidden, and push its header out of view.
 */
export function scrollWithin(element: HTMLElement, block: 'center' | 'start'): void {
  let scroller = element.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  if (!scroller) return
  const box = element.getBoundingClientRect()
  const view = scroller.getBoundingClientRect()
  const offset = block === 'center' ? (view.height - box.height) / 2 : 24
  scroller.scrollTo({ top: scroller.scrollTop + box.top - view.top - Math.max(0, offset), behavior: 'smooth' })
}

/** Scrolls to and focuses the field for `path` (or its nearest parent on the page) and flashes it. */
export function revealIn(container: HTMLElement, path: string): boolean {
  let probe = path
  let target: HTMLElement | null = null
  while (probe && !target) {
    target = container.querySelector<HTMLElement>(`[data-path="${CSS.escape(probe)}"]`)
    const next = probe.replace(/(\.[^.[\]]+|\[\d+\])$/, '')
    probe = next === probe ? '' : next
  }
  if (!target) return false
  const element = target
  scrollWithin(element, 'center')
  const control = FOCUS_ORDER.map((selector) => element.querySelector<HTMLElement>(selector)).find(Boolean)
  control?.focus({ preventScroll: true })
  element.dataset.flash = ''
  setTimeout(() => delete element.dataset.flash, 1600)
  return true
}

/**
 * Focuses `focus` after the page renders, unless a YamlForm already did. `nonce` repeats it for a second "Go to field"
 * on the same path, which leaves the URL as it was.
 */
export function useReveal(container: RefObject<HTMLElement | null>, focus: string | null, nonce: number) {
  useEffect(() => {
    const root = container.current
    if (!focus || !root) return
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const owner = active && root.contains(active) ? active.closest<HTMLElement>('[data-path]')?.dataset.path : undefined
    if (nonce === 0 && owner && within(focus, [owner])) return
    revealIn(root, focus)
  }, [container, focus, nonce])
}

export const FLASH =
  '[&_[data-flash]]:rounded-md [&_[data-flash]]:outline-2 [&_[data-flash]]:outline-offset-4 [&_[data-flash]]:outline-focus'

function prettyPath(path: string): string {
  return path.split('.').join(' › ')
}

/** The bot's own config error at the top of a config screen, with a way to the field that caused it. */
export function ProblemBanner({ route, onReveal }: { route: Route; onReveal: (path: string) => void }) {
  const { problem, path } = useConfig()
  if (!problem) return null
  const target = problem.path ? configRoute(problem.path) : null
  const elsewhere = target !== null && target !== route
  const named = /^Config value \S+?(?=[,.:;]?\s)/.exec(problem.message)
  const text =
    named && problem.path ? `${prettyPath(problem.path)}${problem.message.slice(named[0].length)}` : problem.message
  const message = /[.!?]$/.test(text) ? text : `${text}.`
  const secret = /Missing required environment variable: ([A-Z][A-Z0-9_]*)/.exec(problem.message)?.[1]
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-danger bg-surface px-5 py-4">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body font-medium text-ink">{fileName(path)} would not load</p>
        <p className="text-small break-words text-ink-2">
          {message}
          {elsewhere && ` Fix it in ${SCREEN_TITLES[target] ?? target}, then save again.`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {secret && (
          <Button icon={KeyRound} onClick={() => navigate(`${href('secrets')}?focus=${encodeURIComponent(secret)}`)}>
            Open Secrets
          </Button>
        )}
        {problem.path && target && (
          <Button
            onClick={() => {
              const focus = problem.path as string
              if (elsewhere)
                navigate(`${href(target)}?focus=${encodeURIComponent(focus)}&file=${encodeURIComponent(path)}`)
              else onReveal(focus)
            }}
          >
            Go to field
          </Button>
        )}
      </div>
    </div>
  )
}

/** The unsaved edits to config.yml as a line diff; open when the URL asks for `tab=diff` (the "Review diff" action). */
export function ConfigDiff() {
  const workspace = useWorkspace()
  const { search } = useLocation()
  const config = workspace.config
  const file = search.get('file')
  const wanted = search.get('tab') === 'diff' && (!file || file === config?.path)
  const [open, setOpen] = useState(wanted)
  const [seen, setSeen] = useState(wanted)
  if (wanted !== seen) {
    setSeen(wanted)
    if (wanted) setOpen(true)
  }
  const counts = useMemo(() => {
    if (!config || config.draft === config.saved) return null
    const lines = (value: string) => value.replace(/\n$/, '').split('\n').length
    return diffLines(config.saved, config.draft).reduce(
      (total, part) => ({
        added: total.added + (part.added ? lines(part.value) : 0),
        removed: total.removed + (part.removed ? lines(part.value) : 0)
      }),
      { added: 0, removed: 0 }
    )
  }, [config])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = box.current
    const first = open && counts ? element?.querySelector<HTMLElement>('td[aria-label]') : null
    if (!element || !first) return
    element.scrollTop += first.getBoundingClientRect().top - element.getBoundingClientRect().top - 60
  }, [open, counts])
  if (!config || !counts) return null
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-lg border border-line bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-5 py-3 transition-colors duration-150 hover:bg-subtle [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-90"
        />
        <span className="text-body font-medium text-ink">Unsaved changes</span>
        <span className="font-mono text-code-sm text-ink-3">{fileName(config.path)}</span>
        <span className="ml-auto font-mono text-code-sm">
          <span className="text-success">+{counts.added}</span> <span className="text-danger">−{counts.removed}</span>
        </span>
      </summary>
      <div ref={box} className="max-h-[480px] overflow-auto border-t border-line px-3 py-2">
        <DiffView path={config.path} before={config.saved} after={config.draft} />
      </div>
    </details>
  )
}

/** Focus handling shared by the config screens: the URL's focus plus repeat requests from the banner. */
export function useFocusTarget(container: RefObject<HTMLElement | null>) {
  const { focus } = useConfig()
  const [request, setRequest] = useState<{ path: string; nonce: number } | null>(null)
  const [seen, setSeen] = useState(focus)
  if (seen !== focus) {
    setSeen(focus)
    setRequest(null)
  }
  const target = request?.path ?? focus
  useReveal(container, target, request?.nonce ?? 0)
  return {
    target,
    nonce: request?.nonce ?? 0,
    reveal: (path: string) => setRequest((current) => ({ path, nonce: (current?.nonce ?? 0) + 1 }))
  }
}

export interface IndexEntry {
  path: string
  label: string
}

function OnThisPage({ entries, container }: { entries: IndexEntry[]; container: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(entries[0]?.path)
  useEffect(() => {
    const root = container.current
    if (!root) return
    const targets = entries.flatMap((entry) => {
      const name = CSS.escape(entry.path)
      const target = root.querySelector<HTMLElement>(`[data-index="${name}"], [data-path="${name}"]`)
      return target ? [{ path: entry.path, target }] : []
    })
    // The section nearest the top of the reading area is the current one.
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.filter((record) => record.isIntersecting)
        if (visible.length === 0) return
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const found = targets.find((entry) => entry.target === top.target)
        if (found) setActive(found.path)
      },
      { rootMargin: '-15% 0px -65% 0px' }
    )
    for (const { target } of targets) observer.observe(target)
    return () => observer.disconnect()
  }, [entries, container])
  return (
    <nav aria-label="On this page" className="sticky top-6 hidden w-44 shrink-0 self-start xl:block">
      <p className="px-2 pb-2 text-label text-ink-3">On this page</p>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry) => {
          const current = entry.path === active
          return (
            <li key={entry.path}>
              <a
                href={`#${entry.path}`}
                aria-current={current ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  const name = CSS.escape(entry.path)
                  const target = container.current?.querySelector<HTMLElement>(
                    `[data-index="${name}"], [data-path="${name}"]`
                  )
                  if (target) scrollWithin(target, 'start')
                  setActive(entry.path)
                }}
                className={`flex h-8 items-center rounded-md px-2 text-body transition-colors duration-150 ${
                  current ? 'bg-selected font-medium text-accent-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                }`}
              >
                <span className="truncate" title={entry.label}>
                  {entry.label}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

interface FormPageProps {
  route: Route
  title: string
  subtitle: ReactNode
  index?: IndexEntry[]
  children: ReactNode
}

/** A single-column config screen: the bot's problem banner, then the section cards, with an index when it is long. */
export function FormPage({ route, title, subtitle, index, children }: FormPageProps) {
  const container = useRef<HTMLDivElement>(null)
  const { reveal } = useFocusTarget(container)
  const { data } = useConfig()
  return (
    <Page title={title} subtitle={subtitle}>
      <div ref={container} className={`flex justify-center gap-8 px-8 py-6 ${FLASH}`}>
        {index && index.length > 0 && <OnThisPage entries={index} container={container} />}
        <div className="flex w-full max-w-[960px] min-w-0 flex-col gap-5">
          <ProblemBanner route={route} onReveal={reveal} />
          <ConfigDiff />
          {data ? (
            children
          ) : (
            <p role="alert" className="rounded-lg border border-danger bg-surface px-5 py-4 text-small text-danger">
              config.yml has a YAML syntax error, so this page cannot show it. Discard your changes to go back to the
              saved file.
            </p>
          )}
        </div>
      </div>
    </Page>
  )
}

/** A card heading in the YamlForm style: title, the mono key and an optional line of help. */
export function CardHeading({
  id,
  title,
  path,
  help
}: { id?: string; title: string; path?: string; help?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className="text-section text-ink">
        {title} {path && <span className="font-mono text-code-sm font-normal text-ink-3">{path}</span>}
      </h2>
      {help && <p className="max-w-[72ch] text-small text-ink-3">{help}</p>}
    </div>
  )
}

function cleanComment(comment: string | null | undefined): string | undefined {
  const text = comment
    ?.split('\n')
    .map((line) => line.replace(/^\s*#?\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
  return text || undefined
}

/** The comment that documents `path` in config.yml, read the way YamlForm reads help text. */
export function helpAt(text: string, path: Path): string | undefined {
  const doc = readDoc(text)
  const parent = doc?.getIn(path.slice(0, -1), true) as Node | undefined
  if (!doc || (path.length > 1 && !isMap(parent))) return undefined
  const map = path.length > 1 ? parent : doc.contents
  if (!isMap(map)) return undefined
  const pair = (map.items as Pair[]).find((item) => String((item.key as Scalar | null)?.value) === String(path.at(-1)))
  const key = pair?.key as Node | null | undefined
  const value = pair?.value as Node | null | undefined
  return cleanComment(value?.comment) ?? cleanComment(key?.commentBefore) ?? cleanComment(value?.commentBefore)
}

/** The keys a page shows, in the order given, then any others in file order. */
export function presentKeys(data: unknown, order: string[]): string[] {
  const keys = data && typeof data === 'object' ? Object.keys(data) : []
  return [...order.filter((key) => keys.includes(key)), ...keys.filter((key) => !order.includes(key))]
}

export function isBlock(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export { humanize } from '../../components/form/YamlForm'
