import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Attachment, ChatInputCommandInteraction } from 'discord.js'
import { InteractionContextType, MessageFlags } from 'discord.js'
import { config } from '../../config.js'
import {
  type BugReportContext,
  type BugReportType,
  createReportIfAllowed,
  updateReportAttachment
} from '../../storage/reportStore.js'
import { logger } from '../../utils/logger.js'
import { isAllowedDiscordCdnUrl } from '../attachments.js'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(moduleDirectory, '../../..')
const packageMetadata = JSON.parse(readFileSync(resolve(projectDirectory, 'package.json'), 'utf8')) as {
  version: string
}

class AttachmentCopyError extends Error {}

function safeAttachmentName(name: string): string {
  const fileName = basename(name.replaceAll('\\', '/'))
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'attachment'
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new AttachmentCopyError('Attachment response had no body')

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) throw new AttachmentCopyError('Attachment response exceeded the configured size limit')
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(chunks, totalBytes)
}

async function recordAttachmentFailure(reportId: number, attachmentError: string): Promise<void> {
  try {
    updateReportAttachment(reportId, null, attachmentError)
  } catch (err) {
    logger.warn({ err, reportId }, 'Failed to update bug report attachment status')
  }
}

async function copyAttachment(reportId: number, attachment: Attachment): Promise<void> {
  const maxBytes = config.report.maxAttachmentBytes
  if (attachment.size > maxBytes) {
    await recordAttachmentFailure(reportId, `Attachment exceeds the ${maxBytes}-byte copy limit`)
    return
  }
  if (!isAllowedDiscordCdnUrl(attachment.url)) {
    await recordAttachmentFailure(reportId, 'Attachment URL is not on an allowed Discord CDN host')
    return
  }

  let filePath: string | undefined
  try {
    const response = await fetch(attachment.url, { redirect: 'error' })
    if (!response.ok) throw new AttachmentCopyError(`Discord CDN returned HTTP ${response.status}`)

    const declaredSize = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      await response.body?.cancel()
      throw new AttachmentCopyError('Attachment response exceeded the configured size limit')
    }
    const body = await readLimitedBody(response, maxBytes)
    const relativePath = `data/reports/${reportId}-${safeAttachmentName(attachment.name)}`
    const reportDirectory = resolve(projectDirectory, 'data/reports')
    filePath = resolve(reportDirectory, `${reportId}-${safeAttachmentName(attachment.name)}`)
    await mkdir(reportDirectory, { recursive: true })
    await writeFile(filePath, body)
    updateReportAttachment(reportId, relativePath, null)
  } catch (error) {
    if (filePath) await rm(filePath, { force: true }).catch(() => {})
    const attachmentError =
      error instanceof AttachmentCopyError
        ? error.message
        : `Attachment download or save failed (${error instanceof Error ? error.name : 'unknown error'})`
    await recordAttachmentFailure(reportId, attachmentError)
  }
}

function reportContext(interaction: ChatInputCommandInteraction): BugReportContext {
  if (interaction.guildId) return 'guild'
  return interaction.context === InteractionContextType.BotDM ? 'bot_dm' : 'private_channel'
}

function displayName(interaction: ChatInputCommandInteraction): string {
  const member = interaction.member
  if (member && 'displayName' in member) return member.displayName
  if (member && 'nick' in member && typeof member.nick === 'string') return member.nick
  return interaction.user.displayName
}

export async function handleReportCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const context = reportContext(interaction)
  const guildId = context === 'guild' ? interaction.guildId : null
  const attachment = interaction.options.getAttachment('attachment')
  const reportId = createReportIfAllowed(
    {
      type: interaction.options.getString('type', true) as BugReportType,
      message: interaction.options.getString('message', true),
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName: displayName(interaction),
      context,
      guildId,
      channelId: interaction.channelId,
      interactionId: interaction.id,
      locale: interaction.locale,
      attachment: attachment
        ? { name: attachment.name, contentType: attachment.contentType, size: attachment.size }
        : null,
      botVersion: packageMetadata.version,
      gitCommit: process.env.GIT_COMMIT ?? null,
      geminiModel: config.gemini.model,
      fallbackModel: config.fallback.model,
      uptimeS: Math.floor(process.uptime())
    },
    config.report
  )

  if (reportId === null) {
    await interaction.editReply({ content: 'You’ve reached the report limit. Please try again later.' })
    return
  }

  if (attachment) await copyAttachment(reportId, attachment)

  logger.info({ reportId, type: interaction.options.getString('type', true), context }, 'Bug report filed')
  await interaction.editReply({ content: `Thanks — report #${reportId} is filed.` })
}
