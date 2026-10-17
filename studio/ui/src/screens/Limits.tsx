import { ArrowRight } from 'lucide-react'
import { href, navigate } from '../lib/router'
import { fileName } from '../state/workspace'
import { CardHeading, ConfigForm, FormPage, helpAt, useConfig } from './models/configShared'

export default function LimitsScreen() {
  const { text, data, path } = useConfig()
  const llm = data?.llm
  const budgets = llm?.monthlyBudgetUsd
  return (
    <FormPage
      route="limits"
      title="Limits"
      subtitle={`${fileName(path)} › rateLimit · llm.monthlyBudgetUsd · llm.modelscopeDailyMagicubes`}
    >
      {data?.rateLimit !== undefined && <ConfigForm order={['rateLimit']} only />}
      {llm && (
        <section
          aria-labelledby="spend-title"
          data-path="llm"
          className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
        >
          <CardHeading
            id="spend-title"
            title="Model spend"
            path="llm"
            help="Caps on what the models may spend each month and each day."
          />
          {budgets !== null && typeof budgets === 'object' && (
            <div data-path="llm.monthlyBudgetUsd" className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-body font-medium text-ink">
                  Monthly budget (USD){' '}
                  <span className="font-mono text-code-sm font-normal text-ink-3">monthlyBudgetUsd</span>
                </h3>
                <p className="max-w-[72ch] text-small text-ink-3">{helpAt(text, ['llm', 'monthlyBudgetUsd'])}</p>
              </div>
              <ConfigForm root={['llm', 'monthlyBudgetUsd']} records={['llm.monthlyBudgetUsd']} />
            </div>
          )}
          {llm.modelscopeDailyMagicubes !== undefined && (
            <div className="border-t border-line pt-4">
              <ConfigForm root={['llm']} order={['modelscopeDailyMagicubes']} only />
            </div>
          )}
          <p className="border-t border-line pt-4 text-small text-ink-3">
            Per-model limits (<span className="font-mono text-code-sm">{'{ rpm, rpd, tpm }'}</span>) live on each model
            entry.{' '}
            <a
              href={href('models')}
              onClick={(event) => {
                event.preventDefault()
                navigate(href('models'))
              }}
              className="inline-flex items-center gap-1 rounded-sm font-medium text-accent-ink hover:underline"
            >
              Edit them in Models
              <ArrowRight aria-hidden className="size-3.5" />
            </a>
          </p>
        </section>
      )}
    </FormPage>
  )
}
