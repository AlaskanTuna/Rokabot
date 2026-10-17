import { useEffect, useState } from 'react'
import { CommandPalette } from './components/shell/CommandPalette'
import { Ambient, Toaster } from './components/shell/HeaderUtilities'
import { Page } from './components/shell/Page'
import { Sidebar, useSidebarCollapsed } from './components/shell/Sidebar'
import { ErrorState, LoadingBody, NoPackState, NoTokenState } from './components/shell/States'
import { readToken, setToken } from './lib/api'
import { useLocation } from './lib/router'
import { watchIdle } from './lib/theme'
import { SCREENS } from './screens'
import { dirtyPaths, load, save, setNoToken, useWorkspace } from './state/workspace'

export function App() {
  const workspace = useWorkspace()
  const { route } = useLocation()
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const token = readToken()
    setToken(token)
    if (token) void load()
    else setNoToken()
    return watchIdle()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching((current) => !current)
      } else if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (dirtyPaths().length > 0) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  const screen = SCREENS[route]
  const shell = workspace.status === 'ready' || workspace.status === 'loading'

  return (
    <div className="relative flex h-full gap-2 p-2">
      <Ambient />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {shell && (
        <div className="relative z-10 flex">
          <Sidebar collapsed={collapsed} onCollapse={setCollapsed} onSearch={() => setSearching(true)} />
        </div>
      )}
      {workspace.status === 'loading' && (
        <Page title={screen.title} subtitle="Loading the pack and checking it…" badges={null}>
          <LoadingBody />
        </Page>
      )}
      {workspace.status === 'ready' && <screen.Component />}
      {workspace.status === 'no-token' && <NoTokenState />}
      {workspace.status === 'no-pack' && <NoPackState />}
      {workspace.status === 'error' && <ErrorState />}
      <CommandPalette open={searching} onClose={() => setSearching(false)} />
      <Toaster />
    </div>
  )
}
