import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseYtDlpMetadata } from '../socialPosts/parsers.js'
import type { SocialPostTarget } from '../socialPosts/urls.js'
import { buildYtDlpArgs, runYtDlp } from '../socialPosts/ytDlp.js'

const tempDirs: string[] = []

async function fakeBinary(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rokabot-yt-dlp-test-'))
  tempDirs.push(dir)
  const path = join(dir, 'fake-yt-dlp')
  await writeFile(path, `#!/usr/bin/env node\n${source}\n`)
  await chmod(path, 0o755)
  return path
}

const target: SocialPostTarget = {
  platform: 'youtube',
  id: 'abc_123',
  lookupKey: 'youtube:abc_123',
  canonicalUrl: 'https://www.youtube.com/watch?v=abc_123',
  extractorUrl: 'https://www.youtube.com/watch?v=abc_123'
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('yt-dlp metadata runner', () => {
  it('uses only the pinned metadata arguments and canonical URL', () => {
    expect(buildYtDlpArgs('https://www.youtube.com/watch?v=abc_123', 6000)).toEqual([
      '--ignore-config',
      '--no-plugin-dirs',
      '--no-cache-dir',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout',
      '6',
      '--retries',
      '0',
      '--extractor-retries',
      '0',
      '--js-runtimes',
      'node',
      '--dump-json',
      '--skip-download',
      'https://www.youtube.com/watch?v=abc_123'
    ])
  })

  it('parses one JSON record from a fake binary', async () => {
    const binary = await fakeBinary("process.stdout.write(JSON.stringify({title:'sample'}))")

    await expect(runYtDlp(binary, target.extractorUrl, 1000)).resolves.toEqual({ metadata: { title: 'sample' } })
  })

  it('kills a timed out child', async () => {
    const binary = await fakeBinary("setTimeout(() => process.stdout.write('{}'), 5000)")

    await expect(runYtDlp(binary, target.extractorUrl, 50)).resolves.toEqual({ reason: 'timeout' })
  })

  it('kills a child that exceeds the stdout cap', async () => {
    const binary = await fakeBinary("process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1))")

    await expect(runYtDlp(binary, target.extractorUrl, 1000)).resolves.toEqual({ reason: 'output_too_large' })
  })

  it('returns a bounded failure for a non-zero exit', async () => {
    const binary = await fakeBinary("process.stderr.write('private URL detail'); process.exit(4)")

    await expect(runYtDlp(binary, target.extractorUrl, 1000)).resolves.toEqual({ reason: 'exit_4' })
  })

  it('keeps signed format URLs out of normalized metadata', () => {
    const post = parseYtDlpMetadata(
      {
        title: 'Video title',
        description: 'Description',
        uploader: 'Creator',
        upload_date: '20261006',
        duration: 12,
        thumbnail: 'https://i.ytimg.com/vi/abc_123/hqdefault.jpg',
        formats: [{ url: 'https://media.example/signed?token=secret' }]
      },
      target,
      1500
    )

    expect(JSON.stringify(post)).not.toContain('signed')
    expect(JSON.stringify(post)).not.toContain('token=secret')
    expect(post.text).toBe('Video title — Description')
  })
})

describe('buildYtDlpArgs extra arguments', () => {
  it('inserts extra arguments just before the URL and leaves the default call unchanged', () => {
    const plain = buildYtDlpArgs('https://www.instagram.com/p/abc/', 6000)
    const withComments = buildYtDlpArgs('https://www.instagram.com/p/abc/', 6000, ['--write-comments'])

    expect(withComments).toEqual([...plain.slice(0, -1), '--write-comments', 'https://www.instagram.com/p/abc/'])
  })
})
