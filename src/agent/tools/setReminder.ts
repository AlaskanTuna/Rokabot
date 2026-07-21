/** Reminder tools: set, list, cancel */

import { createReminder, deleteReminder, getActiveReminders, getReminderById } from '../../storage/reminderStore.js'
import { formatTime, getTimezoneLabel } from '../../utils/timezone.js'

export interface SetReminderParams {
  user_id: string
  channel_id: string
  reminder: string
  delay_minutes: number
}

/** Validate and create a reminder for a user */
export function setReminder(params: SetReminderParams) {
  const { user_id, channel_id, reminder, delay_minutes } = params

  if (delay_minutes < 1 || delay_minutes > 10080) {
    return { success: false, message: 'Delay must be between 1 minute and 7 days (10080 minutes).' }
  }

  const dueAt = Date.now() + delay_minutes * 60 * 1000
  const result = createReminder(user_id, channel_id, reminder, dueAt)

  if (!result.success) {
    return { success: false, message: result.message }
  }

  const tzLabel = getTimezoneLabel()
  const timeStr = formatTime(dueAt)
  return {
    success: true,
    message: `Reminder set. Due at ${timeStr} ${tzLabel} (in ${delay_minutes} minute${delay_minutes !== 1 ? 's' : ''}). Reminder ID: ${result.id}.`,
    reminderId: result.id
  }
}

/** List active reminders for a user */
export function listReminders(params: { user_id: string }) {
  const reminders = getActiveReminders(params.user_id)

  if (reminders.length === 0) {
    return { success: true, message: 'No active reminders.', reminders: [] }
  }

  const tzLabel = getTimezoneLabel()
  const lines = reminders.map((r) => {
    const timeStr = formatTime(r.dueAt)
    return `ID ${r.id}: "${r.reminder}" — due at ${timeStr} ${tzLabel}`
  })

  return {
    success: true,
    message: `Active reminders:\n${lines.join('\n')}`,
    reminders: reminders.map((r) => ({ id: r.id, reminder: r.reminder, dueAt: r.dueAt }))
  }
}

/** Cancel a reminder by ID if it belongs to the user */
export function cancelReminder(params: { user_id: string; reminder_id: number }) {
  const reminder = getReminderById(params.reminder_id)

  if (!reminder) {
    return { success: false, message: `Reminder ID ${params.reminder_id} not found or already delivered.` }
  }

  if (reminder.userId !== params.user_id) {
    return { success: false, message: 'That reminder belongs to someone else.' }
  }

  deleteReminder(params.reminder_id)
  return { success: true, message: `Reminder ID ${params.reminder_id} ("${reminder.reminder}") has been cancelled.` }
}
