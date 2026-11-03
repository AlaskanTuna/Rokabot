/** Reminder command handlers */

import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'
import { MessageFlags } from 'discord.js'
import { character } from '../../../character/index.js'
import { fillLine } from '../../../character/lines.js'
import { config } from '../../../config.js'
import { createReminder, deleteReminder, getActiveReminders, getReminderById } from '../../../storage/reminderStore.js'
import { getTimezoneLabel } from '../../../utils/timezone.js'
import { FLAVOR, PLAYFUL_COLOR, buildToolMessage, randomFrom } from './shared.js'

const LINES = character.lines.reminders

export function handleRemind(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand()
  const userId = interaction.user.id
  const channelId = interaction.channelId

  switch (subcommand) {
    case 'in':
      return handleRemindIn(interaction, userId, channelId)
    case 'at':
      return handleRemindAt(interaction, userId, channelId)
    case 'list':
      return handleRemindList(userId)
    case 'cancel':
      return handleRemindCancel(interaction, userId)
    default:
      return buildToolMessage(LINES.unknown, PLAYFUL_COLOR)
  }
}

function dueSlots(dueAt: number) {
  const dueTimestamp = Math.floor(dueAt / 1000)
  return { when: `<t:${dueTimestamp}:R>`, time: `<t:${dueTimestamp}:t>`, timezone: getTimezoneLabel() }
}

function handleRemindIn(interaction: ChatInputCommandInteraction, userId: string, channelId: string) {
  const task = interaction.options.getString('task', true)
  const minutes = interaction.options.getInteger('minutes', true)

  const dueAt = Date.now() + minutes * 60 * 1000
  const result = createReminder(userId, channelId, task, dueAt)

  if (!result.success) {
    return buildToolMessage(fillLine(LINES.refused, { reason: result.message }), PLAYFUL_COLOR)
  }

  const flavor = randomFrom(FLAVOR.remind)
  const text = `${flavor}\n\n${fillLine(LINES.setIn, dueSlots(dueAt))}`
  return buildToolMessage(text, PLAYFUL_COLOR)
}

function handleRemindAt(interaction: ChatInputCommandInteraction, userId: string, channelId: string) {
  const task = interaction.options.getString('task', true)
  const hour = interaction.options.getInteger('hour', true)
  const minute = interaction.options.getInteger('minute') ?? 0

  const tz = config.timezone ?? undefined

  // Get current time in configured timezone
  const now = new Date()
  let currentHours: number, currentMins: number
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone: tz
    })
    const parts = formatter.format(now).split(':')
    currentHours = parseInt(parts[0], 10)
    currentMins = parseInt(parts[1], 10)
  } catch {
    currentHours = now.getHours()
    currentMins = now.getMinutes()
  }

  const targetMinutes = hour * 60 + minute
  const currentMinutes = currentHours * 60 + currentMins
  let diff = targetMinutes - currentMinutes

  if (diff <= 0) diff += 24 * 60 // next day

  const dueAt = Date.now() + diff * 60 * 1000
  const result = createReminder(userId, channelId, task, dueAt)

  if (!result.success) {
    return buildToolMessage(fillLine(LINES.refused, { reason: result.message }), PLAYFUL_COLOR)
  }

  const flavor = randomFrom(FLAVOR.remind)
  const text = `${flavor}\n\n${fillLine(LINES.setAt, dueSlots(dueAt))}`
  return buildToolMessage(text, PLAYFUL_COLOR)
}

function handleRemindList(userId: string) {
  const reminders = getActiveReminders(userId)

  if (reminders.length === 0) {
    return buildToolMessage(LINES.none, PLAYFUL_COLOR)
  }

  const lines = reminders.map((r) => {
    const ts = Math.floor(r.dueAt / 1000)
    return `**#${r.id}** \u2014 "${r.reminder}"\nDue <t:${ts}:R> (<t:${ts}:t>)`
  })

  const container = new ContainerBuilder()
    .setAccentColor(PLAYFUL_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\u23F0 **Your Reminders**\n\n${lines.join('\n\n')}`))

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}

function handleRemindCancel(interaction: ChatInputCommandInteraction, userId: string) {
  const id = interaction.options.getInteger('id', true)

  const reminder = getReminderById(id)

  if (!reminder) {
    return buildToolMessage(LINES.notFound, PLAYFUL_COLOR)
  }

  if (reminder.userId !== userId) {
    return buildToolMessage(LINES.notYours, PLAYFUL_COLOR)
  }

  deleteReminder(id)
  return buildToolMessage(fillLine(LINES.cancelled, { id, task: reminder.reminder }), PLAYFUL_COLOR)
}
