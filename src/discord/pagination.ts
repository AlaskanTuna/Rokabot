/** Shared page-button collector for paginated command replies */

import type { ButtonInteraction, Message } from 'discord.js'
import { ComponentType, MessageFlags } from 'discord.js'
import { character } from '../character/index.js'

export interface CollectPageButtonsOptions {
  reply: { createMessageComponentCollector: Message['createMessageComponentCollector'] }
  ownerId: string
  prefix: string
  pageCount: number
  startPage?: number
  update: (button: ButtonInteraction, page: number) => Promise<unknown>
  finish: (page: number) => Promise<unknown>
}

/** Collect next/prev presses for the owner, refuse strangers, and finish when the collector ends. */
export function collectPageButtons(options: CollectPageButtonsOptions): void {
  const { reply, ownerId, prefix, pageCount, update, finish } = options
  let currentPage = options.startPage ?? 0
  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 })

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== ownerId) {
      await buttonInteraction.reply({ content: character.lines.tools.notYours, flags: MessageFlags.Ephemeral })
      return
    }

    if (buttonInteraction.customId.startsWith(`${prefix}_next`) && currentPage < pageCount - 1) {
      currentPage++
    } else if (buttonInteraction.customId.startsWith(`${prefix}_prev`) && currentPage > 0) {
      currentPage--
    }

    await update(buttonInteraction, currentPage)
  })

  collector.on('end', async () => {
    await finish(currentPage)
  })
}
