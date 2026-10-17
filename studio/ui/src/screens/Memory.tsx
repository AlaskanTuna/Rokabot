import { fileName } from '../state/workspace'
import { ConfigForm, FormPage, humanize, useConfig } from './models/configShared'

const BLOCKS = ['memory', 'embeddings', 'session']

export default function MemoryScreen() {
  const { data, path } = useConfig()
  const keys = BLOCKS.filter((key) => data?.[key] !== undefined && data?.[key] !== null)
  return (
    <FormPage
      route="memory"
      title="Memory"
      subtitle={`${fileName(path)} › memory · embeddings · session`}
      index={keys.map((key) => ({ path: key, label: humanize(key) }))}
    >
      {keys.length > 0 ? (
        <ConfigForm order={keys} only />
      ) : (
        <p className="rounded-lg border border-line bg-surface px-5 py-4 text-small text-ink-3">
          config.yml sets no memory, embeddings or session block, so the bot uses its built-in defaults.
        </p>
      )}
    </FormPage>
  )
}
