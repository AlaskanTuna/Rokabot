// Force IPv4 before any fetch — the Pi's container DNS returns AAAA records but the host has no working IPv6 path,
// so undici's dual-stack Happy Eyeballs hangs on the v6 attempt. Both calls are stdlib (Node ≥19).
import dns from 'node:dns'
import net from 'node:net'
dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamily(false)

// Suppress ADK console output before imports
if (process.env.ADK_QUIET) {
  const originalInfo = console.info
  const originalLog = console.log
  console.info = (...args: unknown[]) => {
    const joined = args.map(String).join(' ')
    if (joined.includes('[ADK INFO]')) return
    originalInfo(...args)
  }
  console.log = (...args: unknown[]) => {
    const joined = args.map(String).join(' ')
    if (joined.includes('[ADK INFO]')) return
    originalLog(...args)
  }
}

import http from 'node:http'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { createClient } from './discord/client.js'
import { destroyAllSessions } from './agent/roka.js'
import { closeDb, getDb } from './storage/database.js'
import { pruneOldHistory } from './storage/sessionStore.js'
import { pruneOldFacts } from './storage/userMemory.js'
import { cleanupExpired, restoreMonitoredChannels } from './agent/channelMonitor.js'
import { cleanupExpiredCooldowns } from './discord/emojiReactor.js'
import { startReminderScheduler, stopReminderScheduler } from './discord/reminderScheduler.js'
import { destroyAllGames as destroyAllShiritoriGames } from './games/shiritori.js'
import { stopStatusCycler } from './discord/statusCycler.js'

const client = createClient()

client.once('clientReady', () => {
  getDb()
  restoreMonitoredChannels()
  startReminderScheduler(client)

  pruneOldHistory(config.session.historyRetentionDays)
  pruneOldFacts(config.memory.factRetentionDays)

  setInterval(() => pruneOldHistory(config.session.historyRetentionDays), 60 * 60 * 1000)
  setInterval(() => pruneOldFacts(config.memory.factRetentionDays), 24 * 60 * 60 * 1000)
  setInterval(() => cleanupExpired(), 60 * 60 * 1000)
  setInterval(() => cleanupExpiredCooldowns(), 60 * 60 * 1000)
})

const healthServer = http.createServer((_, res) => {
  const healthy = client.isReady()
  res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      status: healthy ? 'ok' : 'unhealthy',
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
      discord: healthy ? 'connected' : 'disconnected'
    })
  )
})
healthServer.listen(3000, '0.0.0.0')

/** Tear down ADK sessions and disconnect Discord before exiting */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received')

  stopStatusCycler()
  stopReminderScheduler()
  destroyAllShiritoriGames()
  await destroyAllSessions()
  closeDb()
  client.destroy()

  logger.info('Roka is going to sleep. Oyasumi~')

  const timeout = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, 5000)
  timeout.unref()

  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection')
})

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception')
  process.exit(1)
})

client.login(config.discord.token).catch((error) => {
  logger.fatal({ error }, 'Failed to login to Discord')
  process.exit(1)
})
