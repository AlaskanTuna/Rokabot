import { ActivityType, type Client } from 'discord.js'
import { character } from '../character/index.js'
import { inHours } from '../character/load.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { getLocalHour } from '../utils/timezone.js'

/** Pick a random status for the current time of day */
function getStatusForHour(hour: number): string {
  const bands = character.lines.status
  const { lines } = bands.find(({ from, to }) => inHours(hour, from, to)) ?? bands[bands.length - 1]
  return lines[Math.floor(Math.random() * lines.length)]
}

let intervalId: ReturnType<typeof setInterval> | null = null

/** Start cycling the bot's status based on time of day */
export function startStatusCycler(client: Client): void {
  function updateStatus() {
    if (!client.user) return
    const hour = getLocalHour()
    const status = getStatusForHour(hour)
    client.user.setPresence({
      activities: [{ name: 'custom', type: ActivityType.Custom, state: status }],
      status: 'online'
    })
    logger.debug({ hour, status }, 'Bot status updated')
  }

  updateStatus()

  intervalId = setInterval(updateStatus, config.statusCycleMs)

  logger.info({ intervalMs: config.statusCycleMs }, 'Status cycler started')
}

/** Stop the status cycler */
export function stopStatusCycler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info('Status cycler stopped')
  }
}
