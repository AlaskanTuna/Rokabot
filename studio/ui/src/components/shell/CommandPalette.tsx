import { CornerDownLeft, FileText, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { href, navigate } from '../../lib/router'
import { setTheme } from '../../lib/theme'
import { dirtyPaths, discard, fileName, routeFor, save, useWorkspace } from '../../state/workspace'
import { NAV } from './Sidebar'

interface Item {
  id: string
  label: string
  detail: string
  run: () => void
}

/** Ctrl/Cmd K: jump to any page or pack file, or run a studio command. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workspace = useWorkspace()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setText('')
      setActive(0)
      dialog.showModal()
      input.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const items = useMemo<Item[]>(() => {
    const pages = NAV.flatMap(({ group, items: entries }) =>
      entries.map(({ route, label }) => ({
        id: `page:${route}`,
        label,
        detail: `${group} page`,
        run: () => navigate(href(route))
      }))
    )
    const files = Object.keys(workspace.files).map((path) => ({
      id: `file:${path}`,
      label: fileName(path),
      detail: path,
      run: () => {
        const target = routeFor(path)
        navigate(href(target.route, target.rest))
      }
    }))
    const commands: Item[] = [
      {
        id: 'cmd:save',
        label: 'Save changes',
        detail: `${dirtyPaths(workspace).length} unsaved`,
        run: () => void save()
      },
      { id: 'cmd:discard', label: 'Discard changes', detail: 'Back to what is on disk', run: () => discard() },
      { id: 'cmd:light', label: 'Light theme', detail: 'Theme', run: () => setTheme('light') },
      { id: 'cmd:dark', label: 'Dark theme', detail: 'Theme', run: () => setTheme('dark') },
      { id: 'cmd:system', label: 'Match system theme', detail: 'Theme', run: () => setTheme('system') }
    ]
    const all = [...pages, ...files, ...commands]
    const needle = text.trim().toLowerCase()
    if (!needle) return all
    return all.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(needle))
  }, [workspace, text])

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, items.length - 1)))
  }, [items.length])

  const run = (item: Item | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <dialog
      ref={ref}
      aria-label="Search settings"
      onClose={() => {
        if (!ref.current?.open) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="glass-overlay mx-auto mt-[12vh] w-[560px] max-w-[calc(100vw-32px)] animate-pop-in rounded-lg p-0 text-ink backdrop:bg-scrim backdrop:backdrop-blur-[10px]"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search aria-hidden className="size-4 text-ink-3" />
        <input
          ref={input}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((current) => (current + step + items.length) % Math.max(1, items.length))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              run(items[active])
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items[active] ? `palette-${active}` : undefined}
          placeholder="Search pages, files and commands"
          className="h-12 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
        <kbd className="font-mono text-code-sm text-ink-3">Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-small text-ink-3">Nothing matches “{text}”.</li>
        )}
        {items.map((item, index) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the search box owns the keyboard (aria-activedescendant)
          <li
            key={item.id}
            id={`palette-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => setActive(index)}
            onClick={() => run(item)}
            className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${index === active ? 'bg-subtle' : ''}`}
          >
            <FileText aria-hidden className="size-4 shrink-0 text-ink-3" />
            <span className="text-body text-ink">{item.label}</span>
            <span className="min-w-0 flex-1 truncate text-right font-mono text-code-sm text-ink-3">{item.detail}</span>
            {index === active && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-ink-3" />}
          </li>
        ))}
      </ul>
    </dialog>
  )
}
