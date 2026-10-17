import { ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Page } from '../components/shell/Page'
import { fileName } from '../state/workspace'
import { AddModel } from './models/AddModel'
import { ModelList } from './models/ModelList'
import {
  CardHeading,
  ConfigDiff,
  ConfigForm,
  FLASH,
  ProblemBanner,
  useConfig,
  useFocusTarget
} from './models/configShared'
import { RoleCard, RoutingCard, useModelEnv } from './models/parts'

/** llm keys this screen edits with its own controls; Limits owns the two budgets. */
const COVERED = [
  'main',
  'fallback',
  'hedgeAfterMs',
  'stickyMs',
  'models',
  'monthlyBudgetUsd',
  'modelscopeDailyMagicubes'
]

const ADVANCED = [
  {
    id: 'gemini',
    title: 'Gemini',
    help: 'Request defaults, retries and attachment budgets for every route, plus the legacy Gemini route.'
  },
  {
    id: 'fallback',
    title: 'Legacy fallback',
    help: 'The ModelScope fallback used without an llm: block. modelscope entries also use its baseUrl.'
  },
  {
    id: 'jev',
    title: 'Jev',
    help: 'Judgments for tone, names, prefetch and memory. Jev runs only with TYPESAFE_API_KEY.'
  }
]

function sectionFor(target: string | null, otherLlm: string[]): string | null {
  if (!target) return null
  const row = /^llm\.models\.([^.[\]]+)[.[]/.exec(target)
  if (row) return `row:${row[1]}`
  const [top, second] = target.split(/[.[]/)
  if (ADVANCED.some((section) => section.id === top)) return top
  return top === 'llm' && otherLlm.includes(second) ? 'llm' : null
}

interface Section {
  id: string
  title: string
  path: string
  help: string
  root: string[]
  order?: string[]
}

export default function ModelsScreen() {
  const container = useRef<HTMLDivElement>(null)
  const { text, data, path, problem } = useConfig()
  const { target, nonce, reveal } = useFocusTarget(container)
  const env = useModelEnv()
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [seen, setSeen] = useState('')
  const llm = data?.llm
  const otherLlm = llm ? Object.keys(llm).filter((key) => !COVERED.includes(key)) : []

  const request = `${target ?? ''}#${nonce}`
  if (request !== seen) {
    setSeen(request)
    const section = sectionFor(target, otherLlm)
    if (section && !opened[section]) setOpened({ ...opened, [section]: true })
  }
  const setOpen = (id: string, open: boolean) => {
    if (Boolean(opened[id]) !== open) setOpened({ ...opened, [id]: open })
  }

  const sections: Section[] = [
    ...(otherLlm.length > 0
      ? [
          {
            id: 'llm',
            title: 'Other llm settings',
            path: 'llm',
            help: 'Keys in the llm block this page has no control for.',
            root: ['llm'],
            order: otherLlm
          }
        ]
      : []),
    ...ADVANCED.filter((section) => data?.[section.id] !== undefined).map((section) => ({
      ...section,
      path: section.id,
      root: [section.id]
    }))
  ]
  const message = problem?.message ?? ''

  return (
    <Page title="Models" subtitle={`${fileName(path)} › llm · any tested profile or OpenAI-compatible server`}>
      <div ref={container} className={`flex flex-col gap-5 px-8 py-6 ${FLASH}`}>
        <ProblemBanner route="models" onReveal={reveal} />
        <ConfigDiff />
        {!data && (
          <p role="alert" className="rounded-lg border border-danger bg-surface px-5 py-4 text-small text-danger">
            config.yml has a YAML syntax error, so this page cannot show it. Discard your changes to go back to the
            saved file.
          </p>
        )}
        {data && !llm?.models && (
          <section className="rounded-lg border border-line bg-surface p-5">
            <CardHeading
              title="No llm block"
              path="llm"
              help="config.yml has no llm: block, so the bot runs gemini.model with the legacy fallback below. Add an llm: block to pick from tested profiles or an OpenAI-compatible server."
            />
          </section>
        )}
        {data && llm?.models && (
          <>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <RoleCard
                kind="main"
                text={text}
                data={data}
                env={env}
                error={problem?.path === 'llm.main' ? message : undefined}
              />
              <RoleCard
                kind="fallback"
                text={text}
                data={data}
                env={env}
                error={problem?.path === 'llm.fallback' ? message : undefined}
              />
            </div>
            {env.error && (
              <p role="alert" className="text-small text-danger">
                Could not read the key status: {env.error}
              </p>
            )}
            <RoutingCard text={text} data={data} problemPath={problem?.path ?? null} problemMessage={message} />
            <ModelList
              text={text}
              data={data}
              env={env}
              problem={problem}
              expanded={Object.fromEntries(
                Object.entries(opened).flatMap(([id, open]) => (id.startsWith('row:') ? [[id.slice(4), open]] : []))
              )}
              onExpand={(name, open) => setOpen(`row:${name}`, open)}
            />
            <AddModel text={text} data={data} env={env} />
          </>
        )}
        {data && sections.length > 0 && (
          <section aria-labelledby="advanced-title" className="flex flex-col gap-3 pt-3">
            <CardHeading
              id="advanced-title"
              title="Advanced"
              help="Request limits, the legacy route and Jev. Most deployments leave these alone."
            />
            {sections.map((section) => (
              <details
                key={section.id}
                data-path={section.path}
                open={Boolean(opened[section.id])}
                onToggle={(event) => setOpen(section.id, event.currentTarget.open)}
                className="group rounded-lg border border-line bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-5 py-4 transition-colors duration-150 hover:bg-subtle [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-90"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-section text-ink">
                      {section.title}{' '}
                      <span className="font-mono text-code-sm font-normal text-ink-3">{section.path}</span>
                    </span>
                    <span className="text-small text-ink-3">{section.help}</span>
                  </span>
                  {sectionFor(problem?.path ?? null, otherLlm) === section.id && (
                    <span className="ml-auto shrink-0 text-small text-danger">1 error</span>
                  )}
                </summary>
                <div className="border-t border-line p-5">
                  <ConfigForm root={section.root} order={section.order} only={Boolean(section.order)} />
                </div>
              </details>
            ))}
          </section>
        )}
      </div>
    </Page>
  )
}
