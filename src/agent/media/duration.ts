import type { MediaKind } from './types.js'

interface Box {
  type: string
  start: number
  headerSize: number
  end: number
}

function readBox(bytes: Buffer, start: number, parentEnd: number): Box | null {
  if (start + 8 > parentEnd || parentEnd > bytes.length) return null

  const declaredSize = bytes.readUInt32BE(start)
  const type = bytes.toString('ascii', start + 4, start + 8)
  if (!/^[\x20-\x7e]{4}$/.test(type)) return null

  let headerSize = 8
  let size: number
  if (declaredSize === 1) {
    if (start + 16 > parentEnd) return null
    const largeSize = bytes.readBigUInt64BE(start + 8)
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null
    size = Number(largeSize)
    headerSize = 16
  } else if (declaredSize === 0) {
    size = parentEnd - start
  } else {
    size = declaredSize
  }

  if (size < headerSize || size > parentEnd - start) return null
  return { type, start, headerSize, end: start + size }
}

function movieDuration(bytes: Buffer, moov: Box): number | null {
  let offset = moov.start + moov.headerSize

  while (offset < moov.end) {
    const child = readBox(bytes, offset, moov.end)
    if (!child) return null
    if (child.type === 'mvhd') {
      const payload = child.start + child.headerSize
      const payloadLength = child.end - payload
      const version = bytes[payload]
      let timescale: number
      let duration: number

      if (version === 0) {
        if (payloadLength < 20) return null
        timescale = bytes.readUInt32BE(payload + 12)
        duration = bytes.readUInt32BE(payload + 16)
      } else if (version === 1) {
        if (payloadLength < 32) return null
        timescale = bytes.readUInt32BE(payload + 20)
        duration = Number(bytes.readBigUInt64BE(payload + 24))
      } else {
        return null
      }

      if (timescale <= 0) return null
      const seconds = duration / timescale
      return Number.isFinite(seconds) && seconds > 0 ? seconds : null
    }
    offset = child.end
  }

  return null
}

/** Seconds from the ISO-BMFF `moov/mvhd` box, or null when absent, truncated or malformed. */
export function mp4DurationSec(bytes: Buffer): number | null {
  let offset = 0

  while (offset < bytes.length) {
    const box = readBox(bytes, offset, bytes.length)
    if (!box) return null
    if (box.type === 'moov') return movieDuration(bytes, box)
    offset = box.end
  }

  return null
}

/** Approximate duration from a countTokens result: ~103 tokens/s for video without fps, 32 for audio. */
export function durationFromTokens(input: { tokens: number; kind: MediaKind; fps?: number }): number | null {
  const { tokens, kind, fps } = input
  if (!Number.isFinite(tokens) || tokens <= 0) return null
  if (kind === 'audio') return tokens / 32
  return fps === undefined ? tokens / 103 : tokens / (32 + 66 * fps)
}
