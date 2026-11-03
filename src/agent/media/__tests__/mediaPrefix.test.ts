import { describe, expect, it } from 'vitest'
import { isobmffAllowsPrefix, prefixPolicyFor } from '../mediaPrefix.js'

/** One ISO-BMFF box: a 32-bit size, a four-character type, then the payload. */
function box(type: string, payloadBytes = 0) {
  const buffer = Buffer.alloc(8 + payloadBytes, 0)
  buffer.writeUInt32BE(8 + payloadBytes, 0)
  buffer.write(type, 4, 'latin1')
  return buffer
}

describe('prefixPolicyFor', () => {
  // Each of these has been cut in half and had its tokens counted; the ratio tracked the byte fraction every
  // time. WAV and WebM are here despite the paper reasoning saying they should not be — see prefixPolicyFor.
  it.each(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/wav', 'video/webm'])(
    'prefixes %s, measured rather than argued',
    (contentType) => {
      expect(prefixPolicyFor(contentType)).toBe('streamable')
    }
  )

  it.each(['video/mp4', 'video/mov', 'video/quicktime', 'video/3gpp'])(
    'treats %s as ISO base media, prefixable only per file',
    (contentType) => {
      expect(prefixPolicyFor(contentType)).toBe('isobmff')
    }
  )

  // Still refused, because still unmeasured. The bar is a cut file and a token count, not an argument.
  it.each(['video/avi', 'video/wmv', 'video/x-flv', 'video/mpeg'])(
    'refuses to prefix %s without a measurement behind it',
    (contentType) => {
      expect(prefixPolicyFor(contentType)).toBe('none')
    }
  )

  // A truncated PNG or PDF is corrupt, not partial — there is no useful prefix of either.
  it.each(['image/png', 'image/jpeg', 'application/pdf'])('never prefixes %s', (contentType) => {
    expect(prefixPolicyFor(contentType)).toBe('none')
  })
})

describe('isobmffAllowsPrefix', () => {
  it('allows a faststart file, whose index precedes its media data', () => {
    expect(isobmffAllowsPrefix(Buffer.concat([box('ftyp', 16), box('moov', 64), box('mdat', 512)]))).toBe(true)
  })

  // The case that decides the whole design: a phone MP4 carries moov last, so a prefix of one has nothing to
  // decode against and must be refused rather than sent.
  it('refuses a file whose media data comes before its index', () => {
    expect(isobmffAllowsPrefix(Buffer.concat([box('ftyp', 16), box('mdat', 512), box('moov', 64)]))).toBe(false)
  })

  it('allows a fragmented file, where moov precedes the moof/mdat pairs', () => {
    const bytes = Buffer.concat([box('ftyp', 16), box('moov', 32), box('moof', 24), box('mdat', 512)])

    expect(isobmffAllowsPrefix(bytes)).toBe(true)
  })

  it('refuses a fragment that arrives before any index', () => {
    expect(isobmffAllowsPrefix(Buffer.concat([box('ftyp', 16), box('moof', 24)]))).toBe(false)
  })

  // Only a prefix was fetched, so running out of bytes proves nothing — and "not proven" has to mean refuse.
  it('refuses when the prefix ends before either box is found', () => {
    expect(isobmffAllowsPrefix(Buffer.concat([box('ftyp', 16), box('free', 32)]))).toBe(false)
  })

  /** A moov box that declares `declaredSize` but only has `presentBody` bytes of it inside the prefix. */
  function moovDeclaring(declaredSize: number, presentBody: number) {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(declaredSize, 0)
    header.write('moov', 4, 'latin1')
    return Buffer.concat([box('ftyp', 16), header, Buffer.alloc(presentBody, 0)])
  }

  // Finding the index is not the same as having it. A moov that starts inside the cut but runs past it
  // leaves a *truncated* index, which decodes to nothing and produces the confident-answer-about-nothing
  // this module exists to rule out. "Cannot prove it" has to mean refuse here as everywhere else.
  it('refuses an index that starts inside the prefix but runs past the end of it', () => {
    expect(isobmffAllowsPrefix(moovDeclaring(1024, 100))).toBe(false)
  })

  it('allows an index that fits entirely inside the prefix', () => {
    expect(isobmffAllowsPrefix(moovDeclaring(1024, 1024 - 8))).toBe(true)
  })

  it('refuses bytes that are not a box list at all', () => {
    expect(isobmffAllowsPrefix(Buffer.from('this is not an MP4 by any reading of it'))).toBe(false)
  })

  it('refuses an empty buffer', () => {
    expect(isobmffAllowsPrefix(Buffer.alloc(0))).toBe(false)
  })

  // Size 0 means "runs to end of file", so nothing follows it and moov cannot be ahead.
  it('refuses a box declared as running to the end of the file', () => {
    const open = Buffer.alloc(8)
    open.writeUInt32BE(0, 0)
    open.write('mdat', 4, 'latin1')

    expect(isobmffAllowsPrefix(Buffer.concat([box('ftyp', 16), open]))).toBe(false)
  })

  // Size 1 means the real 64-bit size follows the type. Walking past it wrongly would misread every
  // subsequent box, so a large first box must not derail the scan.
  it('walks past a 64-bit sized box to find the index behind it', () => {
    const large = Buffer.alloc(24, 0)
    large.writeUInt32BE(1, 0)
    large.write('free', 4, 'latin1')
    large.writeBigUInt64BE(24n, 8)

    expect(isobmffAllowsPrefix(Buffer.concat([large, box('moov', 32)]))).toBe(true)
  })

  it('refuses a box whose declared size cannot be real', () => {
    const broken = Buffer.alloc(16, 0)
    broken.writeUInt32BE(3, 0)
    broken.write('ftyp', 4, 'latin1')

    expect(isobmffAllowsPrefix(broken)).toBe(false)
  })
})
