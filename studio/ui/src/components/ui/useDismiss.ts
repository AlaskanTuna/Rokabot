import { type RefObject, useEffect } from 'react'

/** Closes a popover on Escape or a pointer press outside it. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
  ...also: RefObject<HTMLElement | null>[]
): void {
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current && !ref.current.contains(target) && !also.some((extra) => extra.current?.contains(target)))
        close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, close, also])
}
