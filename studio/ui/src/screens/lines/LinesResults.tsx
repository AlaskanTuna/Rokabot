import { YamlForm, humanize } from '../../components/form/YamlForm'
import type { Problem } from '../../lib/api'
import type { JsonSchema } from '../../lib/schema'
import { commentsAlong } from '../identity/outline'
import type { Match } from './search'

interface LinesResultsProps {
  text: string
  onChange: (text: string) => void
  problems: Problem[]
  query: string
  matches: Match[]
  schema?: JsonSchema
}

// Inside a group card, YamlForm's own top-level cards become plain sub-sections, as they are in the full form.
const NESTED =
  '[&>div>section]:rounded-none [&>div>section]:border-x-0 [&>div>section]:border-b-0 [&>div>section]:bg-transparent [&>div>section]:p-0 [&>div>section]:pt-3 [&>div>section_h3]:text-body [&>div>section_h3]:font-medium'

function GroupCard({
  text,
  onChange,
  problems,
  group,
  keys,
  schema
}: Omit<LinesResultsProps, 'query' | 'matches'> & Match) {
  const help = commentsAlong(text, [group])[0]
  const problem = problems.find((entry) => entry.path === group)
  return (
    <section data-path={group} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="text-section text-ink">
          {humanize(group)} <span className="font-mono text-code-sm font-normal text-ink-3">{group}</span>
        </h2>
        {help && <p className="max-w-[72ch] text-small text-ink-3">{help}</p>}
        {problem && (
          <p role="alert" className="text-small text-danger">
            {problem.message}
          </p>
        )}
      </div>
      <div className={NESTED}>
        <YamlForm
          text={text}
          onChange={onChange}
          problems={problems}
          root={[group]}
          order={keys ?? []}
          only
          schema={schema}
          level={3}
        />
      </div>
    </section>
  )
}

/** The Lines form narrowed to the groups and keys that match a search. */
export function LinesResults({ text, onChange, problems, query, matches, schema }: LinesResultsProps) {
  if (matches.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-small text-ink-3">
        No line matches “{query.trim()}”.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {matches.map(({ group, keys }) =>
        keys === null ? (
          <YamlForm
            key={group}
            text={text}
            onChange={onChange}
            problems={problems}
            order={[group]}
            only
            schema={schema}
          />
        ) : (
          <GroupCard
            key={group}
            text={text}
            onChange={onChange}
            problems={problems}
            group={group}
            keys={keys}
            schema={schema}
          />
        )
      )}
    </div>
  )
}
