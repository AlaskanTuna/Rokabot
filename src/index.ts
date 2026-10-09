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
import { cleanupExpired, restoreMonitoredChannels } from './agent/channelMonitor.js'
import { registerChannelVisibility } from './agent/memory/channelVisibility.js'
import { pruneEpisodesAndReembed } from './agent/memory/episodeMaintenance.js'
import { flushOpenEpisodes } from './agent/memory/episodeTracker.js'
import { pruneStaleClaims } from './agent/memory/memoryClaims.js'
import { reclassifyClaims } from './agent/memory/reclassify.js'
import {
  startExtractionScheduler,
  stopExtractionScheduler,
  waitForInFlightExtractions
} from './agent/memory/scheduler.js'
import { destroyAllSessions } from './agent/session.js'
import { beginShutdown } from './agent/shutdownSignal.js'
import { config } from './config.js'
import { createChannelVisibilityResolver } from './discord/channelVisibility.js'
import { createClient } from './discord/client.js'
import { cleanupExpiredCooldowns } from './discord/emojiReactor.js'
import { startReminderScheduler, stopReminderScheduler } from './discord/reminderScheduler.js'
import { initializeSocialPosts } from './discord/socialPosts/service.js'
import { stopStatusCycler } from './discord/statusCycler.js'
import { destroyAllGames as destroyAllShiritoriGames } from './games/shiritori.js'
import { closeDb, getDb } from './storage/database.js'
import { pruneFailedExtractionJobs, resetStuckProcessing } from './storage/extractionQueue.js'
import { pruneExtractionSamples } from './storage/extractionSampleStore.js'
import { pruneFailureDiagnostics, pruneOldMetrics } from './storage/metricsStore.js'
import { pruneOldHistory } from './storage/sessionStore.js'
import { logger } from './utils/logger.js'

await initializeSocialPosts()

const client = createClient()
let claimPruneTimer: ReturnType<typeof setInterval> | undefined
let loggedPassiveMemoryDisabled = false

function startupMemoryTasks(botUserId?: string): void {
  if (!config.jev.apiKey && !loggedPassiveMemoryDisabled) {
    logger.warn('Passive memory extraction is disabled: no TypeSafe API key')
    loggedPassiveMemoryDisabled = true
  }

  try {
    pruneStaleClaims(config.memory.claimRetentionDays, botUserId)
    reclassifyInBackground()
    pruneExpiredFailedExtractions()
    claimPruneTimer = setInterval(
      () => {
        pruneStaleClaims(config.memory.claimRetentionDays, botUserId)
        reclassifyInBackground()
        pruneExpiredFailedExtractions()
        pruneEpisodesInBackground()
      },
      24 * 60 * 60 * 1000
    )
    resetStuckProcessing()
    startExtractionScheduler()
    pruneEpisodesInBackground()
  } catch (err) {
    logger.error({ err }, 'Failed to start memory tasks')
  }
}

function reclassifyInBackground(): void {
  void reclassifyClaims().catch((err: unknown) => {
    logger.warn({ err }, 'Memory reclassification failed')
  })
}

function pruneExpiredFailedExtractions(): void {
  const deleted = pruneFailedExtractionJobs(config.memory.failedExtractionRetentionDays)
  logger.info({ deleted }, 'Pruned expired failed extraction jobs')
}

function pruneExpiredExtractionSamples(): void {
  try {
    const removed = pruneExtractionSamples()
    if (removed > 0) logger.info({ removed }, 'Pruned extraction samples')
  } catch (error) {
    logger.warn({ err: error }, 'Failed to prune extraction samples')
  }
}

function pruneEpisodesInBackground(): void {
  void pruneEpisodesAndReembed().catch((err: unknown) => {
    logger.error({ err }, 'Failed to prune and repair memory episodes')
  })
}

function stopMemoryTasks(): void {
  if (claimPruneTimer) clearInterval(claimPruneTimer)
  claimPruneTimer = undefined
  stopExtractionScheduler()
}

client.once('clientReady', () => {
  getDb()
  restoreMonitoredChannels()
  startReminderScheduler(client)

  pruneOldHistory(config.session.historyRetentionDays)
  pruneOldMetrics(config.metrics.retentionDays)
  pruneFailureDiagnostics(config.metrics.diagnosticsRetentionHours)
  pruneExpiredExtractionSamples()
  registerChannelVisibility(createChannelVisibilityResolver(client))
  startupMemoryTasks(client.user?.id)

  setInterval(() => pruneOldHistory(config.session.historyRetentionDays), 60 * 60 * 1000)
  setInterval(() => pruneOldMetrics(config.metrics.retentionDays), 24 * 60 * 60 * 1000)
  setInterval(pruneExpiredExtractionSamples, 24 * 60 * 60 * 1000)
  setInterval(() => pruneFailureDiagnostics(config.metrics.diagnosticsRetentionHours), 60 * 60 * 1000)
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

  beginShutdown()
  flushOpenEpisodes()
  stopStatusCycler()
  stopReminderScheduler()
  stopMemoryTasks()
  destroyAllShiritoriGames()
  await destroyAllSessions()
  await waitForInFlightExtractions()
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
  logger.error({ err: reason }, 'Unhandled rejection')
})

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception')
  process.exit(1)
})

client.login(config.discord.token).catch((error) => {
  logger.fatal({ error }, 'Failed to login to Discord')
  process.exit(1)
})
