import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_AUDIO_SIZE_BYTES,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES
} from '../../agent/attachmentLimits.js'
import { config } from '../../config.js'
import { MAX_ATTACHMENTS } from '../attachments.js'
import { inFlightBytes, release, reservationFor, tryReserve } from '../byteBudget.js'

const BUDGET = config.discord.maxInFlightAttachmentBytes

const image = (size?: number) => ({ url: 'https://cdn.example/i.png', contentType: 'image/png', size })
const document = (size?: number) => ({ url: 'https://cdn.example/d.pdf', contentType: 'application/pdf', size })
const audio = (size?: number) => ({ url: 'https://cdn.example/a.ogg', contentType: 'audio/ogg', size })
const video = (size?: number) => ({ url: 'https://cdn.example/v.mp4', contentType: 'video/mp4', size })

beforeEach(() => {
  release(inFlightBytes())
})

describe('reservationFor', () => {
  it('reserves the stated size when the source gives one', () => {
    expect(reservationFor([image(1234)])).toBe(1234)
  })

  it('reserves the image ceiling when an image states no size', () => {
    expect(reservationFor([image()])).toBe(MAX_IMAGE_SIZE_BYTES)
  })

  it('reserves the document ceiling when a document states no size', () => {
    expect(reservationFor([document()])).toBe(MAX_DOCUMENT_SIZE_BYTES)
  })

  it('sums across the attachments of one turn', () => {
    expect(reservationFor([image(100), image(200), document(300)])).toBe(600)
  })

  it('reserves nothing for a turn carrying no attachments', () => {
    expect(reservationFor([])).toBe(0)
  })

  // The download refuses on Content-Length before buffering, so bytes above the ceiling are never held.
  it('clamps an oversized image to the image ceiling', () => {
    expect(reservationFor([image(MAX_IMAGE_SIZE_BYTES * 5)])).toBe(MAX_IMAGE_SIZE_BYTES)
  })

  it('clamps an oversized document to the document ceiling', () => {
    expect(reservationFor([document(MAX_DOCUMENT_SIZE_BYTES * 5)])).toBe(MAX_DOCUMENT_SIZE_BYTES)
  })

  // Audio has a ceiling of its own. Inheriting the document one would reserve 10 MB for a clip the download
  // refuses at 8, so the budget and the download would disagree about the same file.
  it('reserves the audio ceiling when an audio clip states no size', () => {
    expect(reservationFor([audio()])).toBe(MAX_AUDIO_SIZE_BYTES)
  })

  it('clamps an oversized audio clip to the audio ceiling, not the document one', () => {
    expect(reservationFor([audio(MAX_DOCUMENT_SIZE_BYTES)])).toBe(MAX_AUDIO_SIZE_BYTES)
  })

  // Honest limitation: MAX_VIDEO_SIZE_BYTES and MAX_DOCUMENT_SIZE_BYTES are both 10 MB today, so removing
  // video's branch from sizeLimitFor changes no behaviour and this assertion cannot fail. It is here to
  // state the intended ceiling, not to guard it — it starts guarding the moment the two diverge.
  // The prefix path depends on this: an oversized file is Range-fetched down to its ceiling, so the ceiling
  // is what actually arrives and what must be reserved. The clamp was written for a different reason — the
  // download refuses on Content-Length before buffering — and happens to be right for this one too.
  it('reserves only what will arrive for a file far past its ceiling', () => {
    expect(reservationFor([audio(200 * 1024 * 1024)])).toBe(MAX_AUDIO_SIZE_BYTES)
  })

  it('reserves the video ceiling when a video states no size', () => {
    expect(reservationFor([video()])).toBe(MAX_VIDEO_SIZE_BYTES)
  })
})

describe('tryReserve', () => {
  it('admits a turn that fits', () => {
    expect(tryReserve(1024)).toBe(true)
  })

  it('counts an admitted turn against the budget', () => {
    tryReserve(1024)
    expect(inFlightBytes()).toBe(1024)
  })

  it('admits a turn that lands exactly on the budget', () => {
    expect(tryReserve(BUDGET)).toBe(true)
  })

  it('refuses a turn one byte over the budget', () => {
    expect(tryReserve(BUDGET + 1)).toBe(false)
  })

  it('leaves the budget untouched by a refused turn', () => {
    tryReserve(BUDGET + 1)
    expect(inFlightBytes()).toBe(0)
  })

  it('admits a turn with no attachments even at a full budget', () => {
    tryReserve(BUDGET)
    expect(tryReserve(0)).toBe(true)
  })

  // The per-channel guard would let each of these through; only the global budget sees their sum.
  it('refuses a second turn whose bytes only exceed the budget in aggregate', () => {
    const half = Math.floor(BUDGET / 2) + 1
    tryReserve(half)
    expect(tryReserve(half)).toBe(false)
  })

  it('admits the second of two turns that fit together', () => {
    const half = Math.floor(BUDGET / 2)
    tryReserve(half)
    expect(tryReserve(half)).toBe(true)
  })
})

describe('release', () => {
  it('hands the bytes back', () => {
    tryReserve(5000)
    release(5000)
    expect(inFlightBytes()).toBe(0)
  })

  it('readmits a turn that was refused before the budget was released', () => {
    tryReserve(BUDGET)
    release(BUDGET)
    expect(tryReserve(BUDGET)).toBe(true)
  })

  it('releases only the bytes handed back, not the whole budget', () => {
    tryReserve(5000)
    release(2000)
    expect(inFlightBytes()).toBe(3000)
  })

  it('clamps at zero so a stray release cannot disable the guard permanently', () => {
    release(9999)
    expect(inFlightBytes()).toBe(0)
  })
})

describe('budget sizing', () => {
  it('is the 32 MB the memory model sizes it at', () => {
    expect(BUDGET).toBe(33_554_432)
  })

  // Below this a maximal turn could never be admitted even on a wholly idle bot, so it would be refused
  // forever rather than merely delayed. Raising MAX_ATTACHMENTS without raising the budget breaks this.
  it('admits the largest single turn the per-turn caps allow', () => {
    expect(MAX_ATTACHMENTS * MAX_DOCUMENT_SIZE_BYTES).toBeLessThanOrEqual(BUDGET)
  })
})
