import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeFetch, json } from '../../tests/harness/fakeFetch.js'
import {
  type LoadedPhoto,
  type PhotoResult,
  buildCsv,
  buildSummary,
  loadPhotos,
  parseArgs,
  runBakeOff,
  summarize
} from '../bake-off-image-id.js'
import { cloudVisionRequest, createCloudVisionBackend, parseCloudVisionResponse } from '../imageId/cloudVision.js'
import { HYBRID_LENS_NAME, buildVisionRequest, createOwnVisionBackend } from '../imageId/ownVision.js'
import {
  __resetLensCacheForTest,
  createSerpapiLensBackend,
  lensMatches,
  lensSearchRequest,
  parseLensResponse
} from '../imageId/serpapiLens.js'
import { type ImageIdBackend, exactMatch, normalizeIdentity, percentile } from '../imageId/types.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function photo(file: string, expectedName: string | null): LoadedPhoto {
  return {
    file,
    bytes: Buffer.from('bytes'),
    mime: 'image/jpeg',
    expected: expectedName === null ? null : { name: expectedName }
  }
}

function stubBackend(name: string, identify: ImageIdBackend['identify']): ImageIdBackend {
  return { name, identify }
}

async function testPng(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer()
}

describe('normalizeIdentity', () => {
  it('ignores case and punctuation', () => {
    expect(normalizeIdentity('Maniwa-Roka!')).toBe(normalizeIdentity('maniwa roka'))
  })
})

describe('exactMatch', () => {
  it('matches when the expected name appears in the top candidate', () => {
    expect(
      exactMatch(
        { candidates: [{ name: 'Maniwa Roka Nendoroid', sourceUrls: [] }], abstained: false, rawCost: 0 },
        { name: 'Maniwa Roka' }
      )
    ).toBe(true)
  })

  it('never matches an abstention or an empty candidate list', () => {
    expect(
      exactMatch({ candidates: [{ name: 'Roka', sourceUrls: [] }], abstained: true, rawCost: 0 }, { name: 'Roka' })
    ).toBe(false)
    expect(exactMatch({ candidates: [], abstained: false, rawCost: 0 }, { name: 'Roka' })).toBe(false)
  })

  it('requires a maker token in a source host when a maker is given', () => {
    expect(
      exactMatch(
        {
          candidates: [{ name: 'Roka plush', sourceUrls: ['https://www.goodsmile.info/en/product/1'] }],
          abstained: false,
          rawCost: 0
        },
        { name: 'Roka', maker: 'Good Smile Company' }
      )
    ).toBe(true)
    expect(
      exactMatch(
        {
          candidates: [{ name: 'Roka plush', sourceUrls: ['https://example.com/roka'] }],
          abstained: false,
          rawCost: 0
        },
        { name: 'Roka', maker: 'Good Smile Company' }
      )
    ).toBe(false)
  })
})

describe('percentile', () => {
  it('returns null when empty and the nearest rank otherwise', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
  })
})

describe('runBakeOff and summarize', () => {
  const photos = [photo('known.jpg', 'Maniwa Roka'), photo('unknown.jpg', null)]

  function backends(): ImageIdBackend[] {
    return [
      stubBackend('sharp-eyed', async () => ({
        candidates: [{ name: 'Maniwa Roka figure', sourceUrls: [] }],
        abstained: false,
        rawCost: 0.01
      })),
      stubBackend('shy', async () => ({ candidates: [], abstained: true, rawCost: 0 }))
    ]
  }

  it('scores exact IDs, abstentions on unknowns and failing backends', async () => {
    const failing = stubBackend('broken', async () => {
      throw new Error('boom')
    })
    const results = await runBakeOff(photos, [...backends(), failing])
    expect(results).toHaveLength(6)
    const broken = results.filter((row) => row.backend === 'broken')
    expect(broken.every((row) => row.abstained && row.costUsd === 0)).toBe(true)
    const summaries = summarize(results, backends())
    const sharp = summaries.find((summary) => summary.backend === 'sharp-eyed')
    expect(sharp).toMatchObject({ photos: 2, precision: 1, recall: 1, abstentionUnknown: 0, costUsd: 0.02 })
    expect(sharp?.p50Ms).not.toBeNull()
    const shy = summaries.find((summary) => summary.backend === 'shy')
    expect(shy).toMatchObject({ precision: null, recall: 0, abstentionUnknown: 1 })
  })

  it('renders CSV with a header, nulls as blanks and quoted commas', async () => {
    const results: PhotoResult[] = [
      {
        file: 'a.jpg',
        expectedName: 'Roka, Nendoroid',
        backend: 'b',
        topCandidate: 'Roka "Nendo"',
        confidence: 0.5,
        abstained: false,
        exact: true,
        latencyMs: 12,
        costUsd: 0.0015
      },
      {
        file: 'u.jpg',
        expectedName: null,
        backend: 'b',
        topCandidate: null,
        confidence: null,
        abstained: true,
        exact: false,
        latencyMs: 3,
        costUsd: 0
      }
    ]
    const csv = buildCsv(results)
    expect(csv.split('\n')[0]).toBe('file,expected,backend,topCandidate,confidence,abstained,exact,latencyMs,costUsd')
    expect(csv).toContain('"Roka, Nendoroid"')
    expect(csv).toContain('"Roka ""Nendo"""')
  })

  it('renders a summary table and names skipped backends', () => {
    const md = buildSummary(
      [
        {
          backend: 'b',
          photos: 2,
          precision: 1,
          recall: 0.5,
          abstentionUnknown: 1,
          p50Ms: 10,
          p95Ms: 20,
          costUsd: 0.02
        }
      ],
      ['cloudVision']
    )
    expect(md).toContain('| b | 2 | 1.00 | 0.50 | 1.00 | 10 | 20 | 0.0200 |')
    expect(md).toContain('Skipped cloudVision')
  })
})

describe('parseArgs and loadPhotos', () => {
  it('requires both flags and rejects unknown ones', () => {
    expect(parseArgs(['--photos', 'p', '--out', 'o'])).toEqual({ photosDir: 'p', outDir: 'o' })
    expect(() => parseArgs(['--photos', 'p'])).toThrow('--out')
    expect(() => parseArgs(['--photos', 'p', '--out', 'o', '--live'])).toThrow('Unknown argument')
  })

  it('loads labelled photos through the bot image processor and skips missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bakeoff-'))
    await writeFile(join(dir, 'roka.png'), await testPng())
    await writeFile(
      join(dir, 'labels.json'),
      JSON.stringify([
        { file: 'roka.png', expected: { name: 'Maniwa Roka', maker: 'Good Smile' } },
        { file: 'missing.jpg', expected: null }
      ])
    )
    const photos = await loadPhotos(dir)
    expect(photos).toHaveLength(1)
    expect(photos[0]?.mime).toBe('image/jpeg')
    expect(photos[0]?.expected?.maker).toBe('Good Smile')
  })
})

describe('ownVision', () => {
  it('searches the identified name and attaches the source URLs', async () => {
    let queried = ''
    const backend = createOwnVisionBackend({
      runVision: async () => '{"name": "Maniwa Roka", "confidence": 0.9}',
      runSearch: async (query) => {
        queried = query
        return [{ title: 'Roka', url: 'https://shop.example/roka' }]
      }
    })
    const output = await backend.identify(Buffer.from('img'), 'image/jpeg')
    expect(queried).toBe('Maniwa Roka')
    expect(output).toMatchObject({
      abstained: false,
      candidates: [{ name: 'Maniwa Roka', confidence: 0.9, sourceUrls: ['https://shop.example/roka'] }]
    })
  })

  it('abstains when the model names nothing usable', async () => {
    const backend = createOwnVisionBackend({
      runVision: async () => 'not json',
      runSearch: async () => []
    })
    const output = await backend.identify(Buffer.from('img'), 'image/jpeg')
    expect(output.abstained).toBe(true)
  })

  it('builds a vision request with the photo bytes inline', () => {
    const bytes = Buffer.from('img')
    const request = buildVisionRequest(bytes, 'image/jpeg')
    const parts = request.contents?.[0]?.parts ?? []
    expect(parts.some((part) => part.inlineData?.data === bytes.toString('base64'))).toBe(true)
  })
})

describe('hybridLens', () => {
  it('passes Lens titles into the vision prompt and reports as hybridLens', async () => {
    let prompt = ''
    const backend = createOwnVisionBackend({
      runVision: async (request) => {
        prompt = JSON.stringify(request.contents)
        return '{"name": "Lian Li DAN A3"}'
      },
      runSearch: async () => [{ title: 'Lian Li', url: 'https://lian-li.com/a3' }],
      lensHints: async (url) => (url === 'https://cdn.example/pc.jpg' ? ['Lian Li DAN Cases A3-mATX Wood Edition'] : [])
    })
    const output = await backend.identify(Buffer.from('img'), 'image/jpeg', 'https://cdn.example/pc.jpg')
    expect(backend.name).toBe(HYBRID_LENS_NAME)
    expect(prompt).toContain('Lian Li DAN Cases A3-mATX Wood Edition')
    expect(output.candidates[0]?.name).toBe('Lian Li DAN A3')
  })

  it('keeps the plain prompt when there are no hints', () => {
    expect(JSON.stringify(buildVisionRequest(Buffer.from('x'), 'image/jpeg').contents)).not.toContain('reverse image')
  })

  it('spends one Lens search per photo URL across the Lens backend and the hints', async () => {
    __resetLensCacheForTest()
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ visual_matches: [{ title: 'Miku Fuwa Fuwa', link: 'https://x' }] })
    )
    await createSerpapiLensBackend(fetchImpl, 'key').identify(
      Buffer.from('a'),
      'image/jpeg',
      'https://cdn.example/m.jpg'
    )
    const again = await lensMatches('https://cdn.example/m.jpg', 'key', fetchImpl)
    expect(again.candidates[0]?.name).toBe('Miku Fuwa Fuwa')
    expect(calls).toHaveLength(1)
  })
})

describe('cloudVision', () => {
  it('posts WEB_DETECTION with base64 content and reads candidates and sources', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({
        responses: [
          {
            webDetection: {
              bestGuessLabels: [{ label: 'Maniwa Roka' }],
              webEntities: [{ description: 'Roka figure', score: 0.8 }],
              fullMatchingImages: [{ url: 'https://shop.example/roka' }],
              pagesWithMatchingImages: [{ url: 'https://wiki.example/roka' }]
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchImpl)
    const backend = createCloudVisionBackend(fetchImpl, 'test-key')
    const output = await backend.identify(Buffer.from('img'), 'image/jpeg')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://vision.googleapis.com/v1/images:annotate?key=test-key')
    const body = JSON.parse(String(calls[0]?.init.body))
    expect(body.requests[0].features).toEqual([{ type: 'WEB_DETECTION', maxResults: 10 }])
    expect(body.requests[0].image.content).toBe(Buffer.from('img').toString('base64'))
    expect(output.abstained).toBe(false)
    expect(output.candidates[0]).toMatchObject({
      name: 'Maniwa Roka',
      sourceUrls: ['https://shop.example/roka', 'https://wiki.example/roka']
    })
  })

  it('abstains when there are no full or partial matching images', () => {
    expect(
      parseCloudVisionResponse({ responses: [{ webDetection: { bestGuessLabels: [{ label: 'Roka' }] } }] }).abstained
    ).toBe(true)
    expect(cloudVisionRequest(Buffer.from('x'), 'k').url).toContain('vision.googleapis.com')
  })
})

describe('serpapiLens', () => {
  it('searches Lens over the photo URL and keeps the visual matches', async () => {
    __resetLensCacheForTest()
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ visual_matches: [{ title: 'Roka Nendoroid', link: 'https://shop.example/roka' }] })
    )
    const backend = createSerpapiLensBackend(fetchImpl, 'key')
    const output = await backend.identify(Buffer.from('img'), 'image/jpeg', 'https://cdn.example/roka.jpg')
    expect(output).toMatchObject({
      abstained: false,
      candidates: [{ name: 'Roka Nendoroid', sourceUrls: ['https://shop.example/roka'] }]
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(lensSearchRequest('https://cdn.example/roka.jpg', 'key').url)
  })

  it('refuses a photo with no URL instead of uploading its bytes', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}))
    const backend = createSerpapiLensBackend(fetchImpl, 'key')
    await expect(backend.identify(Buffer.from('img'), 'image/jpeg')).rejects.toThrow('needs a url')
    expect(calls).toHaveLength(0)
  })

  it('abstains on empty visual matches', () => {
    expect(parseLensResponse({ visual_matches: [] }).abstained).toBe(true)
  })
})
