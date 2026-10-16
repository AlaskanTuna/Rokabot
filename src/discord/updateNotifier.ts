/** Once a day, tell the bot's owner when a newer Rokabot release is out. */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Client, User } from 'discord.js'
import { config } from '../config.js'
import { markUpdateNotified, wasUpdateNotified } from '../storage/updateNoticeStore.js'
import { logger } from '../utils/logger.js'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(moduleDirectory, '../..')
const RUNNING_VERSION = (
  JSON.parse(readFileSync(resolve(projectDirectory, 'package.json'), 'utf8')) as { version: string }
).version

export interface LatestRelease {
  tag: string
  url: string
}

type ParsedVersion = { core: [number, number, number]; pre: string | null }

function parseVersion(tag: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tag.trim())
  if (!match) return null
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
}

/** Whether `latest` is a newer release than `current`; a pre-release sorts before its release. */
export function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest)
  const now = parseVersion(current)
  if (!next || !now) return false
  for (let index = 0; index < 3; index++) {
    if (next.core[index] !== now.core[index]) return next.core[index] > now.core[index]
  }
  if (next.pre === now.pre) return false
  if (next.pre === null) return true
  if (now.pre === null) return false
  return next.pre.localeCompare(now.pre, 'en', { numeric: true }) > 0
}

export async function fetchLatestRelease(repo: string, fetcher: typeof fetch = fetch): Promise<LatestRelease | null> {
  const response = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rokabot-update-check' },
    signal: AbortSignal.timeout(10_000)
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  const body = (await response.json()) as { tag_name?: unknown; html_url?: unknown }
  if (typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') return null
  return { tag: body.tag_name, url: body.html_url }
}

async function resolveOwner(client: Client): Promise<User | null> {
  const application = await client.application?.fetch()
  const owner = application?.owner
  if (!owner) return null
  return 'members' in owner ? (owner.owner?.user ?? null) : owner
}

function updateMessage(latest: LatestRelease, current: string): string {
  return [
    `Rokabot ${latest.tag} is out~ This bot is still on v${current}.`,
    `What's new: ${latest.url}`,
    'With the autoupdate profile it installs itself within a day; otherwise run `docker compose pull && docker compose up -d`.'
  ].join('\n')
}

export async function checkForUpdate(
  client: Client,
  options: { fetcher?: typeof fetch; currentVersion?: string } = {}
): Promise<'off' | 'failed' | 'current' | 'notified'> {
  if (!config.updates.notify) return 'off'
  let latest: LatestRelease | null
  try {
    latest = await fetchLatestRelease(config.updates.repo, options.fetcher)
  } catch (error) {
    logger.debug({ err: error, repo: config.updates.repo }, 'Release check failed')
    return 'failed'
  }
  const current = options.currentVersion ?? RUNNING_VERSION
  if (!latest || !isNewerVersion(latest.tag, current) || wasUpdateNotified(latest.tag)) return 'current'

  try {
    const owner = await resolveOwner(client)
    if (owner) await owner.send(updateMessage(latest, current))
    else logger.warn({ tag: latest.tag }, 'No application owner to tell about the new release')
  } catch (error) {
    // Recorded anyway: an owner with closed DMs would otherwise be retried every interval, forever.
    logger.warn({ err: error, tag: latest.tag }, 'Could not DM the owner about the new release')
  }
  markUpdateNotified(latest.tag)
  return 'notified'
}

let timer: ReturnType<typeof setInterval> | null = null

export function startUpdateNotifier(client: Client): void {
  if (!config.updates.notify || timer) return
  const run = () => {
    checkForUpdate(client).catch((error) => logger.warn({ err: error }, 'Release check crashed'))
  }
  run()
  timer = setInterval(run, config.updates.checkIntervalHours * 3_600_000)
  timer.unref?.()
  logger.info({ intervalHours: config.updates.checkIntervalHours }, 'Release check started')
}

export function stopUpdateNotifier(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
