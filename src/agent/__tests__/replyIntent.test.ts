import { describe, expect, it } from 'vitest'
import { asksAboutReplies } from '../replyIntent.js'

describe('asksAboutReplies', () => {
  it.each([
    'What do the comments say',
    'what are the top 5 comments saying?',
    'what are people saying in the replies?',
    'is the reply section mad lol',
    'how are people reacting to it',
    'any good reactions?',
    'what does the internet think about this',
    'what is everyone saying about it',
    'did anyone respond in the thread?'
  ])('offers read_replies for %s', (text) => {
    expect(asksAboutReplies(text)).toBe(true)
  })

  // A Reddit link carries /comments/ in its path, so the speaker's words are read without their links.
  it.each([
    '<@123> what is this post about? https://www.reddit.com/r/osugame/comments/1x0b7lo/sample/',
    'what does this mean https://x.com/ClaudeDevs/status/2107895957933408429',
    'lol nice',
    'who posted it?',
    'summarize the video for me'
  ])('withholds read_replies for %s', (text) => {
    expect(asksAboutReplies(text)).toBe(false)
  })
})
