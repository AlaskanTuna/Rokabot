import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRedditFeedPost, parseVxRedditPage } from '../redditFeed.js'
import { parseSocialPostUrl } from '../urls.js'

const target = parseSocialPostUrl('https://www.reddit.com/r/osugame/comments/1x0b7lo/sample/')!
const IMAGE_POST = readFileSync(new URL('../../../../tests/fixtures/social/reddit-post.rss', import.meta.url), 'utf8')

function selfPostFeed(body: string): string {
  const content = `&lt;!-- SC_OFF --&gt;&lt;div class=&quot;md&quot;&gt;${body}&lt;/div&gt;&lt;!-- SC_ON --&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/poster_two&quot;&gt; /u/poster_two &lt;/a&gt;`
  return `<feed><entry><author><name>/u/poster_two</name></author><category term="osugame" label="r/osugame"/><content type="html">${content}</content><id>t3_1x0b7lo</id><published>2026-10-06T10:00:00+00:00</published><title>Is HDHR worth learning?</title></entry></feed>`
}

describe('parseRedditFeedPost', () => {
  // yt-dlp only extracts Reddit video posts; image and text posts are readable from the comment feed's first entry.
  it('reads an image post from the comment feed', () => {
    expect(parseRedditFeedPost(IMAGE_POST, target, 1500)).toMatchObject({
      platform: 'reddit',
      id: '1x0b7lo',
      authorHandle: 'poster_one',
      authorName: 'r/osugame',
      createdAt: '2026-10-07',
      text: 'cryshina | toromi hearts 2 +DT 99.02% 7xMiss & 1264pp if ranked 💖',
      imageUrl: 'https://preview.redd.it/sample.jpeg?width=640&crop=smart',
      photoCount: 1,
      videoCount: 0,
      replyCount: null
    })
  })

  it('reads a text post with its body and no image', () => {
    expect(
      parseRedditFeedPost(selfPostFeed('&lt;p&gt;I keep missing &amp;amp; it&amp;#39;s rough.&lt;/p&gt;'), target, 1500)
    ).toMatchObject({
      authorHandle: 'poster_two',
      text: "Is HDHR worth learning? — I keep missing & it's rough.",
      imageUrl: null,
      photoCount: 0
    })
  })

  it('marks a post whose link is a Reddit-hosted video', () => {
    const videoPost = IMAGE_POST.replace('https://i.redd.it/sample.jpeg', 'https://v.redd.it/sample')

    expect(parseRedditFeedPost(IMAGE_POST, target, 1500)?.videoCount).toBe(0)
    expect(parseRedditFeedPost(videoPost, target, 1500)?.videoCount).toBe(1)
  })

  it('caps the text and returns null without a post entry', () => {
    expect(parseRedditFeedPost(IMAGE_POST, target, 8)?.text).toBe('cryshina')
    expect(parseRedditFeedPost('<feed></feed>', target, 1500)).toBeNull()
    expect(parseRedditFeedPost('<html>blocked</html>', target, 1500)).toBeNull()
  })
})

// Head tags from a real vxreddit page for a video post.
const VXREDDIT_VIDEO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta property="og:site_name" content="u/Antw87 on r/videos - ⬆️ 14492 | 💬 448" />
<meta property="og:url" content="https://www.reddit.com/comments/6rrwyj" />
<meta property="og:title" content="That small heart attack." />
<meta property="og:type" content="video.other" />
<meta property="og:video" content="https://vxreddit.com/redditvideo.mp4?video_url=https%3A%2F%2Fv.redd.it%2Fzv89llsvexdz%2FHLS_1_5_M_v4.m3u8&audio_url=https%3A%2F%2Fv.redd.it%2Fzv89llsvexdz%2FHLS_AUDIO_160_K_v4.m3u8" />
<meta property="og:image" content="https://external-preview.redd.it/cb9nHfWc4zsYYbcuv8gzdCLWdID6cRhyVn59shrI2T8.png?format=pjpg&amp;auto=webp&amp;s=2feabfe7468104961f6650d87ce9d2b6fc5ec360" />
</head>
</html>`

describe('parseVxRedditPage', () => {
  it('reads a video post from the OpenGraph tags', () => {
    expect(parseVxRedditPage(VXREDDIT_VIDEO_PAGE, target, 1500)).toMatchObject({
      platform: 'reddit',
      id: '1x0b7lo',
      authorHandle: 'Antw87',
      authorName: 'r/videos',
      text: 'That small heart attack.',
      imageUrl:
        'https://external-preview.redd.it/cb9nHfWc4zsYYbcuv8gzdCLWdID6cRhyVn59shrI2T8.png?format=pjpg&auto=webp&s=2feabfe7468104961f6650d87ce9d2b6fc5ec360',
      photoCount: 1,
      videoCount: 1,
      createdAt: null,
      video: null
    })
  })

  it('joins the title and self-text of a text post', () => {
    const selfPost = [
      '<meta property="og:site_name" content="u/poster_two on r/osugame - ⬆️ 3 | 💬 1" />',
      '<meta property="og:title" content="Is HDHR worth learning?" />',
      '<meta property="og:description" content="I keep missing &amp; it&#39;s rough." />'
    ].join('\n')

    expect(parseVxRedditPage(selfPost, target, 1500)).toMatchObject({
      authorHandle: 'poster_two',
      authorName: 'r/osugame',
      text: "Is HDHR worth learning? — I keep missing & it's rough.",
      imageUrl: null,
      photoCount: 0,
      videoCount: 0
    })
  })

  it('returns null without an og:title', () => {
    expect(parseVxRedditPage('<html><head></head><body>Redirecting...</body></html>', target, 1500)).toBeNull()
  })
})
