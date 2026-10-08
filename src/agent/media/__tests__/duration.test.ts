import { describe, expect, it } from 'vitest'
import { durationFromTokens, mp4DurationSec } from '../duration.js'

type BoxSize = '32-bit' | '64-bit' | 'to-end'

function box(type: string, payload: Buffer = Buffer.alloc(0), size: BoxSize = '32-bit'): Buffer {
  const headerSize = size === '64-bit' ? 16 : 8
  const result = Buffer.alloc(headerSize + payload.length)
  result.writeUInt32BE(size === '64-bit' || size === 'to-end' ? (size === '64-bit' ? 1 : 0) : result.length, 0)
  result.write(type, 4, 'ascii')
  if (size === '64-bit') result.writeBigUInt64BE(BigInt(result.length), 8)
  payload.copy(result, headerSize)
  return result
}

function mvhdV0(): Buffer {
  const payload = Buffer.alloc(20)
  payload.writeUInt32BE(1000, 12)
  payload.writeUInt32BE(213_000, 16)
  return box('mvhd', payload)
}

function mvhdV1(): Buffer {
  const payload = Buffer.alloc(32)
  payload[0] = 1
  payload.writeUInt32BE(1000, 20)
  payload.writeBigUInt64BE(213_000n, 24)
  return box('mvhd', payload)
}

describe('mp4DurationSec', () => {
  it('reads a version-0 movie header', () => {
    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('moov', mvhdV0())]))).toBe(213)
  })

  it('reads a version-1 movie header', () => {
    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('moov', mvhdV1())]))).toBe(213)
  })

  it('returns null when moov is missing', () => {
    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('mdat')]))).toBeNull()
  })

  it('returns null when mvhd is truncated', () => {
    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('moov', box('mvhd', Buffer.alloc(19)))]))).toBeNull()
  })

  it('finds moov when media data comes first', () => {
    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('mdat', Buffer.alloc(4)), box('moov', mvhdV0())]))).toBe(213)
  })

  it('walks 64-bit sized boxes at both container levels', () => {
    const payload = Buffer.alloc(20)
    payload.writeUInt32BE(1000, 12)
    payload.writeUInt32BE(213_000, 16)

    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('moov', box('mvhd', payload, '64-bit'), '64-bit')]))).toBe(
      213
    )
  })

  it('walks a box whose size extends to the end of the file', () => {
    expect(mp4DurationSec(Buffer.concat([box('ftyp'), box('moov', mvhdV0(), 'to-end')]))).toBe(213)
  })

  it('returns null when a box is truncated or malformed', () => {
    const truncated = Buffer.from([0, 0, 0, 20, 109, 111, 111, 118, 0, 0, 0, 8])
    const malformed = Buffer.from([0, 0, 0, 3, 109, 111, 111, 118])

    expect(mp4DurationSec(truncated)).toBeNull()
    expect(mp4DurationSec(malformed)).toBeNull()
  })
})

describe('durationFromTokens', () => {
  it('uses the countTokens rate for video without fps metadata', () => {
    expect(durationFromTokens({ tokens: 22_014, kind: 'video' })).toBeCloseTo(213.7, 1)
  })

  it('uses the video frame rate when fps metadata was counted', () => {
    expect(durationFromTokens({ tokens: 42_771, kind: 'video', fps: 0.05 })).toBeCloseTo(42_771 / 35.3, 5)
  })

  it('uses 32 tokens per second for audio', () => {
    expect(durationFromTokens({ tokens: 3200, kind: 'audio' })).toBe(100)
  })

  it('returns null for zero, negative or non-finite token counts', () => {
    for (const tokens of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(durationFromTokens({ tokens, kind: 'video' })).toBeNull()
    }
  })
})
