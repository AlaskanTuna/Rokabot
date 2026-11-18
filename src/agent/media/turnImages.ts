/** Turn-scoped registry of the turn's image URLs in message order, for the identify_image tool. */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { MediaAttachment } from './attachments.js'

const imagesForTurn = new AsyncLocalStorage<string[]>()

/** Opens one turn's image registry. Entered beside withSearchSources in turnPipeline.ts. */
export function withTurnImages<T>(run: () => T): T {
  return imagesForTurn.run([], run)
}

/** Keeps the urls of the turn's image attachments, in message order. A safe no-op with no turn scope open. */
export function registerTurnImages(attachments: readonly MediaAttachment[]): void {
  const store = imagesForTurn.getStore()
  if (!store) return
  for (const attachment of attachments) {
    if (attachment.contentType.startsWith('image/')) store.push(attachment.url)
  }
}

/** The url of the nth image of the turn (1-based), or undefined when the index is unknown or no scope is open. */
export function turnImageUrl(index: number): string | undefined {
  return imagesForTurn.getStore()?.[index - 1]
}
