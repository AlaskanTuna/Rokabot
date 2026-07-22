import type { ToneKey } from '../../src/agent/prompts/tones.js'
import { getToneStyle } from '../../src/discord/toneStyles.js'
import type { CaptureRecord } from './captureSink.js'

type PayloadObject = Record<string, unknown>

const toneKeys = [
  'playful',
  'sincere',
  'domestic',
  'flustered',
  'curious',
  'annoyed',
  'tender',
  'confident',
  'nostalgic',
  'mischievous',
  'sleepy',
  'competitive'
] as const satisfies readonly ToneKey[]

function asObject(value: unknown): PayloadObject | null {
  if (typeof value !== 'object' || value === null) return null

  const candidate = value as PayloadObject
  const toJSON = candidate.toJSON
  if (typeof toJSON === 'function') {
    return asObject(toJSON.call(value))
  }

  return candidate
}

function asObjects(value: unknown): PayloadObject[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const object = asObject(item)
    return object ? [object] : []
  })
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function componentDetails(payload: PayloadObject): {
  accentColor: number | null
  texts: string[]
  thumbnails: string[]
} {
  const details = { accentColor: null as number | null, texts: [] as string[], thumbnails: [] as string[] }

  function walk(items: PayloadObject[]): void {
    for (const item of items) {
      const type = item.type
      if (type === 17) {
        const accentColor = item.accent_color ?? item.accentColor
        if (typeof accentColor === 'number') details.accentColor = accentColor
      }
      if (type === 10) {
        const content = stringValue(item.content)
        if (content) details.texts.push(content)
      }

      const media = asObject(item.media)
      const thumbnailUrl = media && stringValue(media.url)
      if (thumbnailUrl) details.thumbnails.push(thumbnailUrl)

      const accessory = asObject(item.accessory)
      const accessoryMedia = accessory && asObject(accessory.media)
      const accessoryUrl = accessoryMedia && stringValue(accessoryMedia.url)
      if (accessoryUrl) details.thumbnails.push(accessoryUrl)

      walk(asObjects(item.components))
    }
  }

  walk(asObjects(payload.components))
  return details
}

function isComponentsV2Payload(payload: unknown): boolean {
  const object = asObject(payload)
  return object !== null && asObjects(object.components).some((component) => component.type === 17)
}

function toneLabel(color: number): string {
  const tone = toneKeys.find((key) => getToneStyle(key).color === color)
  const hex = `#${color.toString(16).padStart(6, '0').toUpperCase()}`
  return tone ? `${tone} (${hex})` : hex
}

function renderEmbeds(payload: PayloadObject): string[] {
  return asObjects(payload.embeds).flatMap((embed, index) => {
    const parts: string[] = []
    const title = stringValue(embed.title)
    const description = stringValue(embed.description)
    if (title) parts.push(`Title: ${title}`)
    if (description) parts.push(`Description: ${description}`)

    for (const field of asObjects(embed.fields)) {
      const name = stringValue(field.name)
      const value = stringValue(field.value)
      if (name && value) parts.push(`${name}: ${value}`)
    }

    return parts.length > 0 ? [`Embed ${index + 1}: ${parts.join(' | ')}`] : []
  })
}

function chunkLabel(record: CaptureRecord, index?: number, records?: readonly CaptureRecord[]): string | null {
  if (!records || index === undefined || !isComponentsV2Payload(record.payload)) return null

  const chunks = records.filter((candidate) => isComponentsV2Payload(candidate.payload))
  if (chunks.length < 2) return null

  const chunkIndex = chunks.indexOf(record) + 1
  return chunkIndex > 0 ? `chunk ${chunkIndex}/${chunks.length}` : null
}

/** Render one captured Discord outbound payload for terminal inspection. */
export function renderPayload(record: CaptureRecord, index?: number, records?: readonly CaptureRecord[]): string {
  const label = chunkLabel(record, index, records)
  const heading = `${record.kind.toUpperCase()}${label ? ` (${label})` : ''}`

  if (record.kind === 'typing') return heading
  if (record.kind === 'react') return `${heading}\nReaction: ${String(record.payload)}`
  if (typeof record.payload === 'string') return `${heading}\nContent: ${record.payload}`

  const payload = asObject(record.payload)
  if (!payload) return heading

  const lines = [heading]
  const content = stringValue(payload.content)
  if (content) lines.push(`Content: ${content}`)

  const details = componentDetails(payload)
  if (details.texts.length > 0 || details.accentColor !== null || details.thumbnails.length > 0) {
    lines.push('Components V2')
    if (details.accentColor !== null) lines.push(`Tone Accent: ${toneLabel(details.accentColor)}`)
    for (const text of details.texts) lines.push(`Text: ${text}`)
    for (const thumbnail of details.thumbnails) lines.push(`Expression Thumbnail: ${thumbnail}`)
  }

  lines.push(...renderEmbeds(payload))
  return lines.join('\n')
}
