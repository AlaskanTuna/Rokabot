import { useEffect, useState } from 'react'
import { DiffView } from '../../components/editor/DiffView'
import { Tabs } from '../../components/ui/Overlay'
import type { Problem } from '../../lib/api'
import { href, navigate, useLocation } from '../../lib/router'
import { readYaml } from '../../lib/yaml'
import { useWorkspace } from '../../state/workspace'
import { DiscordPreview, type Persona } from './DiscordPreview'

type Tab = 'preview' | 'diff'

interface LinesAsideProps {
  file: string
  focused: string | null
  problems: Problem[]
}

/** The Lines screen's right column: a Discord preview of the last focused line, and the file's diff. */
export function LinesAside({ file, focused, problems }: LinesAsideProps) {
  const workspace = useWorkspace()
  const location = useLocation()
  const wanted = location.search.get('tab')
  const [tab, setTab] = useState<Tab>(wanted === 'diff' ? 'diff' : 'preview')
  useEffect(() => {
    if (wanted === 'diff' || wanted === 'preview') setTab(wanted)
  }, [wanted])

  const state = workspace.files[file]
  const character = readYaml(workspace.files[`${workspace.dir}/character.yml`]?.draft) as Partial<Persona> | undefined
  const summaryName = workspace.validation?.ok ? workspace.validation.summary.name : undefined
  const persona: Persona = {
    name: character?.name || summaryName || 'Bot',
    fullName: character?.fullName || character?.name || summaryName || 'Bot',
    world: character?.world || ''
  }

  return (
    <aside
      aria-label="Line preview"
      className="flex min-h-0 flex-col gap-4 overflow-auto border-line bg-glass-raised p-5 @[640px]:border-l"
    >
      <Tabs
        label="Preview panel"
        value={tab}
        options={[
          { value: 'preview', label: 'Preview' },
          { value: 'diff', label: 'Diff' }
        ]}
        onValue={(next) => {
          setTab(next)
          if (wanted) navigate(href(location.route, location.rest), { replace: true })
        }}
      />
      {tab === 'preview' ? (
        <DiscordPreview text={state?.draft ?? ''} focused={focused} problems={problems} persona={persona} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface p-2">
          <DiffView path={file} before={state?.saved ?? null} after={state?.draft ?? null} />
        </div>
      )}
    </aside>
  )
}
