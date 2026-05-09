/** Periodic scheduler that delivers due reminders to Discord channels */

import type { Client } from 'discord.js'
import { config } from '../config.js'
import { getDueReminders, markDelivered } from '../storage/reminderStore.js'
import { logger } from '../utils/logger.js'

let intervalId: ReturnType<typeof setInterval> | null = null

export function startReminderScheduler(client: Client): void {
  intervalId = setInterval(async () => {
    const dueReminders = getDueReminders()
    for (const reminder of dueReminders) {
      try {
        const channel = await client.channels.fetch(reminder.channelId)
        if (channel && 'send' in channel) {
          await (channel as { send: (msg: string) => Promise<unknown> }).send(
            `Hey <@${reminder.userId}>~ you asked me to remind you: "${reminder.reminder}" \u266a`
          )
          markDelivered(reminder.id)
          logger.info({ reminderId: reminder.id, userId: reminder.userId }, 'Reminder delivered')
        } else {
          try {
            const user = await client.users.fetch(reminder.userId)
            await user.send(
              `Hey~ you asked me to remind you: "${reminder.reminder}" \u266a\n\n-# (Sent as DM because I couldn't reach the original channel)`
            )
            markDelivered(reminder.id)
            logger.info(
              { reminderId: reminder.id, userId: reminder.userId },
              'Reminder delivered via DM (channel fallback)'
            )
          } catch {
            markDelivered(reminder.id)
            logger.warn({ reminderId: reminder.id }, 'Reminder channel and DM both inaccessible, marking delivered')
          }
        }
      } catch (error) {
        logger.warn({ reminderId: reminder.id, error }, 'Channel delivery failed, attempting DM fallback')
        try {
          const user = await client.users.fetch(reminder.userId)
          await user.send(
            `Hey~ you asked me to remind you: "${reminder.reminder}" \u266a\n\n-# (Sent as DM because I couldn't reach the original channel)`
          )
          markDelivered(reminder.id)
          logger.info(
            { reminderId: reminder.id, userId: reminder.userId },
            'Reminder delivered via DM (channel fallback)'
          )
        } catch {
          markDelivered(reminder.id)
          logger.warn({ reminderId: reminder.id }, 'Both channel and DM delivery failed, marking delivered')
        }
      }
    }
  }, config.reminders.checkIntervalMs)

  logger.info({ intervalMs: config.reminders.checkIntervalMs }, 'Reminder scheduler started')
}

export function stopReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info('Reminder scheduler stopped')
  }
}
