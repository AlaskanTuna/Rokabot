import { fileName } from '../state/workspace'
import { CardHeading, ConfigForm, FormPage, humanize, isBlock, presentKeys, useConfig } from './models/configShared'

const OWN = [
  'discord',
  'socialPosts',
  'media',
  'emoji',
  'reminders',
  'games',
  'updates',
  'report',
  'metrics',
  'logging',
  'statusCycleMs',
  'timezone'
]

/** Top-level keys the other config screens show. */
const ELSEWHERE = ['llm', 'gemini', 'fallback', 'jev', 'memory', 'embeddings', 'session', 'rateLimit']

/** The pack switcher in the sidebar sets this key, so it is shown here but not edited. */
const PACK_KEY = 'character'

export default function DiscordScreen() {
  const { data, path } = useConfig()
  const keys = presentKeys(data, OWN).filter((key) => !ELSEWHERE.includes(key))
  const blocks = keys.filter((key) => isBlock(data?.[key]))
  const general = keys.filter((key) => !blocks.includes(key) && key !== PACK_KEY)
  const hasPack = keys.includes(PACK_KEY)
  const index = [
    ...blocks.map((key) => ({ path: key, label: humanize(key) })),
    ...(general.length > 0 || hasPack ? [{ path: 'general', label: 'General' }] : [])
  ]
  return (
    <FormPage
      route="discord"
      title="Discord"
      subtitle={`${fileName(path)} › discord, socialPosts, media and every other bot setting`}
      index={index}
    >
      {blocks.length > 0 && <ConfigForm order={blocks} only />}
      {(general.length > 0 || hasPack) && (
        <section
          aria-labelledby="general-title"
          data-index="general"
          className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
        >
          <CardHeading id="general-title" title="General" help="Top-level settings outside any block." />
          {general.length > 0 && <ConfigForm order={general} only />}
          {hasPack && (
            <div className="flex flex-col gap-1.5">
              <ConfigForm order={[PACK_KEY]} only readOnly />
              <p className="text-small text-ink-3">
                Read-only here. Switch the character pack from the sidebar, which checks that the pack loads first.
              </p>
            </div>
          )}
        </section>
      )}
    </FormPage>
  )
}
