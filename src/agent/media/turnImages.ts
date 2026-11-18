/** Turn-scoped registry of the turn's image URLs in message order, for the identify_image tool. */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { ImageOrigin, MediaAttachment } from './attachments.js'

/** One of the turn's images with where it came from, so the automatic lookup can skip link previews. */
export interface TurnImage {
  url: string
  origin?: ImageOrigin
}

const imagesForTurn = new AsyncLocalStorage<TurnImage[]>()

/** Opens one turn's image registry. Entered beside withSearchSources in turnPipeline.ts. */
export function withTurnImages<T>(run: () => T): T {
  return imagesForTurn.run([], run)
}

/** Keeps the urls of the turn's image attachments, in message order. A safe no-op with no turn scope open. */
export function registerTurnImages(attachments: readonly MediaAttachment[]): void {
  const store = imagesForTurn.getStore()
  if (!store) return
  for (const attachment of attachments) {
    if (attachment.contentType.startsWith('image/')) {
      store.push({ url: attachment.url, ...(attachment.imageOrigin ? { origin: attachment.imageOrigin } : {}) })
    }
  }
}

/** The url of the nth image of the turn (1-based), or undefined when the index is unknown or no scope is open. */
export function turnImageUrl(index: number): string | undefined {
  return imagesForTurn.getStore()?.[index - 1]?.url
}

/** The turn's images in message order, or an empty list with no turn scope open. */
export function turnImages(): TurnImage[] {
  return (imagesForTurn.getStore() ?? []).map((image) => ({ ...image }))
}
