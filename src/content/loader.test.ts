import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetLoaderCachesForTest,
  assertCodecCompatible,
  CodecVersionMismatchError,
  loadIndex,
  loadManifest,
  loadParadigmShard,
  loadSensesShard,
} from './loader.ts'
import type { Manifest } from './content.schema.ts'

// Mirrors `codec.ts`'s dictionaries exactly (also cross-checked against the real
// `public/content/manifest.json` shipped by task 02's pipeline) — kept as an independent
// literal here (not imported from `codec.ts`) so a test bug can't silently cancel out a
// real bug in the same dictionary the assertion is supposed to be protecting.
const REAL_CODEC = {
  pos: ['NOUN', 'VERB', 'ADJ', 'ADV'],
  level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  number: ['singular', 'plural'],
  case: [
    'nominative',
    'genitive',
    'dative',
    'accusative',
    'instrumental',
    'locative',
    'vocative',
  ],
  gender: [
    'feminine',
    'masculine_personal',
    'masculine_inanimate',
    'masculine_animate',
    'neuter',
    'non_masculine_personal',
    'any',
    'masculine_animate_or_personal',
    'masculine_or_neuter',
    'masculine',
  ],
  degree: ['positive', 'comparative', 'superlative'],
  tense: ['present', 'past', 'future'],
  mood: ['indicative', 'imperative', 'infinitive'],
  aspect: ['imperfective', 'perfective'],
  person: [1, 2, 3],
}

function makeManifest(codecOverrides: Partial<typeof REAL_CODEC> = {}): Manifest {
  return {
    contentVersion: 'abcdef123456',
    generatedAt: '2026-09-01T05:18:06+00:00',
    counts: { words: 2, paradigms: 1, forms: 14 },
    shards: { senses: 16, paradigms: 64 },
    codec: { ...REAL_CODEC, ...codecOverrides },
  }
}

/** Routes a fetch mock by substring match against the request URL, so one mock can serve
 *  manifest.json / index.json / a senses shard / a paradigm shard in the same test. */
function makeFetchMock(routes: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }
    return { ok: true, json: async () => routes[key] } as Response
  })
}

beforeEach(() => {
  __resetLoaderCachesForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('assertCodecCompatible', () => {
  it('accepts a manifest whose codec matches the app dictionaries exactly', () => {
    expect(() => assertCodecCompatible(makeManifest())).not.toThrow()
  })

  it('throws CodecVersionMismatchError when a dictionary gained/lost a value', () => {
    const manifest = makeManifest({ gender: ['feminine', 'masculine'] })
    expect(() => assertCodecCompatible(manifest)).toThrow(CodecVersionMismatchError)
  })

  it('throws when a dictionary has the same values but a different order (order IS the code)', () => {
    const manifest = makeManifest({ case: [...REAL_CODEC.case].reverse() })
    expect(() => assertCodecCompatible(manifest)).toThrow(/case/)
  })

  it('throws a message naming which dictionary disagreed, for a diagnosable error', () => {
    const manifest = makeManifest({ tense: ['present', 'past'] })
    expect(() => assertCodecCompatible(manifest)).toThrow(/tense/)
  })
})

describe('loadManifest', () => {
  it('fetches, Zod-validates and codec-checks manifest.json', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'manifest.json': makeManifest() }))
    const manifest = await loadManifest()
    expect(manifest.contentVersion).toBe('abcdef123456')
    expect(manifest.codec.pos).toEqual(REAL_CODEC.pos)
  })

  it('rejects with CodecVersionMismatchError for a mismatched codec, and never resolves silently', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'manifest.json': makeManifest({ pos: ['NOUN'] }) }))
    await expect(loadManifest()).rejects.toThrow(CodecVersionMismatchError)
  })

  it('memoizes: a second call does not fetch again', async () => {
    const fetchMock = makeFetchMock({ 'manifest.json': makeManifest() })
    vi.stubGlobal('fetch', fetchMock)
    await loadManifest()
    await loadManifest()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lets a failed load be retried (does not permanently cache a rejection)', async () => {
    let attempt = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempt += 1
        if (attempt === 1) return { ok: false, status: 500, json: async () => ({}) } as Response
        return { ok: true, json: async () => makeManifest() } as Response
      }),
    )
    await expect(loadManifest()).rejects.toThrow()
    const manifest = await loadManifest()
    expect(manifest.contentVersion).toBe('abcdef123456')
    expect(attempt).toBe(2)
  })
})

describe('loadIndex', () => {
  const rawRows = [
    ['kobieta|NOUN', 1, 95, 1, 'женщина', 10, 42],
    ['powinien|VERB', 2, 75, 2, 'должен', 11, -1],
  ]

  it('decodes IndexRow tuples into WordIndexEntry using the codec (posCode/levelCode -> values)', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'index.json': rawRows }))
    const entries = await loadIndex()
    expect(entries).toEqual([
      {
        lemma: 'kobieta',
        pos: 'NOUN',
        rank: 95,
        level: 'A1',
        primaryRu: 'женщина',
        sensesShard: 10,
        paradigmShard: 42,
      },
      {
        lemma: 'powinien',
        pos: 'VERB',
        rank: 75,
        level: 'A2',
        primaryRu: 'должен',
        sensesShard: 11,
        paradigmShard: -1,
      },
    ])
  })

  it('memoizes across calls (a second loadIndex() does not refetch)', async () => {
    const fetchMock = makeFetchMock({ 'index.json': rawRows })
    vi.stubGlobal('fetch', fetchMock)
    await loadIndex()
    await loadIndex()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("decodes cold-start-sized JSON well within the 300ms budget (in-process parse/decode only — real network latency isn't part of this measurement)", async () => {
    // 7998 synthetic rows — the real corpus size — to exercise the decode loop at scale.
    const rows: unknown[] = []
    for (let i = 0; i < 7998; i++) {
      rows.push([`word${i}|NOUN`, 1, i + 1, (i % 6) + 1, `перевод${i}`, i % 16, i % 64])
    }
    vi.stubGlobal('fetch', makeFetchMock({ 'index.json': rows }))

    const start = performance.now()
    const entries = await loadIndex()
    const elapsed = performance.now() - start

    expect(entries).toHaveLength(7998)
    // Budget is 300ms end-to-end including network; this machine's pure decode time is
    // logged so a human can sanity-check the real number against the assertion's margin.
    console.log(`[perf] loadIndex() decode of 7998 rows: ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(150)
  })
})

describe('loadSensesShard', () => {
  const shard = {
    'kobieta|NOUN': [{ ru: ['женщина'], en: 'dorosły człowiek płci żeńskiej', primary: true }],
  }

  it('fetches and decodes a senses shard, keyed by wordId', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/010.json': shard }))
    const result = await loadSensesShard(10)
    expect(result.get('kobieta|NOUN')).toEqual([
      { ru: ['женщина'], en: 'dorosły człowiek płci żeńskiej', primary: true },
    ])
  })

  it('two parallel requests for the same shard collapse into a single fetch', async () => {
    const fetchMock = makeFetchMock({ 'senses/010.json': shard })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadSensesShard(10), loadSensesShard(10)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b) // same in-memory Map instance, not just equal content
  })
})

describe('loadParadigmShard', () => {
  // The real `kobieta|NOUN` entry from `public/content/paradigms/042.json` — 7 cases x 2
  // numbers, gender code 1 = feminine everywhere (dominantGender: 1).
  const shard = {
    'kobieta|NOUN': {
      forms: [
        ['kobiety', 2, 4, 1, 0, 0, 0, 0, 0, 0],
        ['kobietom', 2, 3, 1, 0, 0, 0, 0, 0, 0],
        ['kobiet', 2, 2, 1, 0, 0, 0, 0, 0, 0],
        ['kobietami', 2, 5, 1, 0, 0, 0, 0, 0, 0],
        ['kobietach', 2, 6, 1, 0, 0, 0, 0, 0, 0],
        ['kobiety', 2, 1, 1, 0, 0, 0, 0, 0, 0],
        ['kobiety', 2, 7, 1, 0, 0, 0, 0, 0, 0],
        ['kobietę', 1, 4, 1, 0, 0, 0, 0, 0, 0],
        ['kobiecie', 1, 3, 1, 0, 0, 0, 0, 0, 0],
        ['kobiety', 1, 2, 1, 0, 0, 0, 0, 0, 0],
        ['kobietą', 1, 5, 1, 0, 0, 0, 0, 0, 0],
        ['kobiecie', 1, 6, 1, 0, 0, 0, 0, 0, 0],
        ['kobieta', 1, 1, 1, 0, 0, 0, 0, 0, 0],
        ['kobieto', 1, 7, 1, 0, 0, 0, 0, 0, 0],
      ],
      dominantGender: 1,
    },
  }

  it('fetches and decodes a paradigm shard (EncodedForm tuples -> DecodedForm, gender code -> value)', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'paradigms/042.json': shard }))
    const result = await loadParadigmShard(42)
    const kobieta = result.get('kobieta|NOUN')
    expect(kobieta?.forms).toHaveLength(14)
    expect(kobieta?.dominantGender).toBe('feminine')
    expect(kobieta?.forms[0]).toEqual({
      form: 'kobiety',
      number: 'plural',
      case: 'accusative',
      gender: 'feminine',
      degree: undefined,
      tense: undefined,
      person: undefined,
      mood: undefined,
      aspect: undefined,
      analytic: false,
    })
  })

  it('two parallel requests for the same shard collapse into a single fetch (acceptance #8)', async () => {
    const fetchMock = makeFetchMock({ 'paradigms/007.json': shard })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadParadigmShard(7), loadParadigmShard(7)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('a repeat call after the first resolves does not fetch again (acceptance #7)', async () => {
    const fetchMock = makeFetchMock({ 'paradigms/042.json': shard })
    vi.stubGlobal('fetch', fetchMock)
    await loadParadigmShard(42)
    await loadParadigmShard(42)
    await loadParadigmShard(42)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
