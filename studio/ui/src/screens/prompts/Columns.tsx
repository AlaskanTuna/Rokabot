import type { ReactNode } from 'react'

/** The editor screens' three columns: list, editor, preview. Below 1280 px the preview moves under the editor. */
export function Columns({
  list,
  listLabel,
  editor,
  preview
}: { list: ReactNode; listLabel: string; editor: ReactNode; preview: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[272px_minmax(0,1fr)] xl:h-full xl:min-h-0 xl:grid-cols-[272px_minmax(0,1fr)_420px]">
      <nav
        aria-label={listLabel}
        className="flex flex-col gap-1 border-b border-line p-4 md:border-r md:border-b-0 xl:min-h-0 xl:overflow-auto"
      >
        {list}
      </nav>
      <div className="flex min-h-[560px] min-w-0 flex-col gap-3 px-6 py-5 xl:min-h-0 xl:overflow-auto">{editor}</div>
      <div className="flex h-[680px] min-w-0 flex-col border-t border-line md:col-span-2 xl:col-span-1 xl:h-auto xl:min-h-0 xl:border-t-0 [&>aside]:min-h-0 [&>aside]:flex-1">
        {preview}
      </div>
    </div>
  )
}
