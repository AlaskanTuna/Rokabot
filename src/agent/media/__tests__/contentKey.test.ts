import { describe, expect, it } from 'vitest'
import { bytesContentKey, discordAttachmentContentKey, postContentKey, youtubeContentKey } from '../contentKey.js'

describe('content keys', () => {
  it('formats YouTube keys from the video id', () => {
    expect(youtubeContentKey('dQw4w9WgXcQ')).toBe('youtube:dQw4w9WgXcQ')
    expect(youtubeContentKey('dQw4w9WgXcQ')).toBe(youtubeContentKey('dQw4w9WgXcQ'))
  })

  it('keeps a watch around a timestamp apart from a watch of the whole video', () => {
    expect(youtubeContentKey('dQw4w9WgXcQ', 754)).toBe('youtube:dQw4w9WgXcQ@754')
    expect(youtubeContentKey('dQw4w9WgXcQ', 754)).not.toBe(youtubeContentKey('dQw4w9WgXcQ'))
  })

  it('formats post keys from platform, post id and media index', () => {
    expect(postContentKey('reddit', 'abc123', 0)).toBe('reddit:abc123:0')
    expect(postContentKey('tiktok', '7312', 2)).toBe('tiktok:7312:2')
    expect(postContentKey('reddit', 'abc123', 1)).not.toBe(postContentKey('reddit', 'abc123', 0))
  })

  it('keys a Discord attachment by its path, not its signed query or host', () => {
    const key = discordAttachmentContentKey('https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=65f&is=65e&hm=abc')
    expect(key).toBe('discord:/attachments/1/2/clip.mp4')
    expect(discordAttachmentContentKey('https://media.discordapp.net/attachments/1/2/clip.mp4?ex=1')).toBe(key)
    expect(discordAttachmentContentKey('https://cdn.discordapp.com/attachments/1/3/clip.mp4')).not.toBe(key)
  })

  it('hashes bytes with sha256 and is deterministic', () => {
    expect(bytesContentKey(Buffer.from('abc'))).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(bytesContentKey(Buffer.from('abc'))).toBe(bytesContentKey(Buffer.from('abc')))
  })

  it('gives different buffers different keys', () => {
    expect(bytesContentKey(Buffer.from('first clip'))).not.toBe(bytesContentKey(Buffer.from('second clip')))
  })

  it('rejects empty ids', () => {
    expect(() => youtubeContentKey('')).toThrow()
    expect(() => youtubeContentKey('   ')).toThrow()
    expect(() => postContentKey('', 'abc123', 0)).toThrow()
    expect(() => postContentKey('reddit', '', 0)).toThrow()
  })
})
