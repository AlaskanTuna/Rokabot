import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { config } from '../../../src/config.js'
import { createSocialPostViewer } from '../../../src/discord/socialPosts/service.js'
import { parseSocialPostUrl } from '../../../src/discord/socialPosts/urls.js'
import { isYtDlpAvailable } from '../../../src/discord/socialPosts/ytDlp.js'

const ytDlpAvailable = await isYtDlpAvailable(config.socialPosts.ytDlpPath)

it.skipIf(!ytDlpAvailable)(
  'opens one public X post, YouTube video, and Reddit post through the real extractors',
  async () => {
    const viewer = createSocialPostViewer({ ...config.socialPosts, enabled: true })
    const samples = [
      ['x', 'https://x.com/StarWars/status/665052190608723968'],
      ['youtube', 'https://www.youtube.com/shorts/18NGQq7p3LY'],
      ['reddit', 'https://www.reddit.com/r/videos/comments/6rrwyj/that_small_heart_attack/']
    ] as const
    const results: Array<{ platform: string; wallTimeMs: number; status: string }> = []

    for (const [platform, url] of samples) {
      const target = parseSocialPostUrl(url)
      expect(target).not.toBeNull()
      const startedAt = performance.now()
      const result = await viewer.lookup(target!)
      results.push({ platform, wallTimeMs: Math.round(performance.now() - startedAt), status: result.status })
      expect(result.status, `${platform} live lookup`).toBe('found')
    }

    console.info('Social post live results', results)
  },
  30_000
)
