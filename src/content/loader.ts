/**
 * Fetch + in-memory cache layer for the content artifacts in `public/content/**`
 * (`spec/tasks/04-content-access-layer.md` §1).
 *
 * `manifest.json` is the only artifact validated with Zod at runtime (see
 * `content.schema.ts`'s file header — validating all 195,487 forms on a mobile device is
 * out of budget). Everything else is trusted: it was produced and Zod-validated by
 * `scripts/build-content.ts` at build time, and is deployed as an immutable, content-hashed
 * artifact (NFR-13/NFR-14).
 *
 * Every shard is fetched **at most once** and kept in memory as a `Promise` (not just its
 * resolved value) in a `Map<number, Promise<...>>`. Storing the promise itself — not the
 * value it resolves to — is what makes two concurrent callers for the same shard collapse
 * into a single `fetch`: the second caller finds the in-flight promise already sitting in
 * the map (synchronously, before either awaits) and just awaits it too.
 *
 * HTTP-level caching (so a *repeat visit* doesn't refetch over the network) is the service
 * worker's job (task 25) — this module only knows about the in-memory session cache.
 */
import { CODEC_DICTIONARIES, LEVEL, POS } from './codec.ts'
import {
  IndexJsonSchema,
  ManifestSchema,
  type IndexJson,
  type Manifest,
  type ParadigmsShard,
  type SensesShard,
} from './content.schema.ts'
import type { Paradigm, Sense, WordIndexEntry } from '@/types/content.ts'
import { decodeForm } from './codec.ts'
import { GENDER } from './codec.ts'
import { decodeWordId, type WordId } from '@/learning/skills/skill-id.ts'
import { shardFileStem } from './codec.ts'

// ---------------------------------------------------------------------------
// Base URL — respects Vite's configured base path (default `/`) rather than hardcoding it,
// so the loader keeps working if the app is ever deployed under a sub-path.
// ---------------------------------------------------------------------------

function contentUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}content/${relativePath}`
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`content loader: failed to fetch "${url}" (HTTP ${response.status})`)
  }
  return response.json()
}

// ---------------------------------------------------------------------------
// Codec version check (spec §4: "если версии кодека разошлись — бросить понятную ошибку,
// а не молча показать неверный падеж"). Every dictionary declared in `manifest.json` must
// match the app's own `codec.ts` dictionaries exactly (same values, same order — order IS
// the numeric code, per `codec.ts`'s file header).
// ---------------------------------------------------------------------------

export class CodecVersionMismatchError extends Error {
  constructor(dictionary: string, expected: readonly unknown[], actual: readonly unknown[]) {
    super(
      `Content codec mismatch in dictionary "${dictionary}": the app was built expecting ` +
        `[${expected.join(', ')}], but the loaded manifest declares [${actual.join(', ')}]. ` +
        `The deployed content and the deployed app code are out of sync — rebuild content ` +
        `(npm run build:content) and redeploy together, or reload to pick up a matching pair.`,
    )
    this.name = 'CodecVersionMismatchError'
  }
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Throws {@link CodecVersionMismatchError} if `manifest.codec` disagrees with the numeric
 *  dictionaries this build of the app was compiled against. Exported so it can be exercised
 *  directly by tests without needing a network round trip. */
export function assertCodecCompatible(manifest: Manifest): void {
  for (const key of Object.keys(CODEC_DICTIONARIES) as (keyof typeof CODEC_DICTIONARIES)[]) {
    const expected = CODEC_DICTIONARIES[key]
    const actual = manifest.codec[key]
    if (!arraysEqual(expected, actual)) {
      throw new CodecVersionMismatchError(key, expected, actual)
    }
  }
}

// ---------------------------------------------------------------------------
// manifest.json — validated by Zod, and the only place the codec check runs.
// ---------------------------------------------------------------------------

let manifestPromise: Promise<Manifest> | null = null

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetchJson(contentUrl('manifest.json'))
      .then((json) => {
        const manifest = ManifestSchema.parse(json)
        assertCodecCompatible(manifest)
        return manifest
      })
      .catch((error: unknown) => {
        // Let a subsequent call retry (e.g. after the user hits "retry" on ErrorState)
        // instead of permanently caching a rejected promise.
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}

// ---------------------------------------------------------------------------
// index.json — NOT Zod-validated at runtime (performance budget); decoded via codec.ts.
// ---------------------------------------------------------------------------

let indexPromise: Promise<WordIndexEntry[]> | null = null

function decodeIndexRow(row: IndexJson[number]): WordIndexEntry {
  const [id, posCode, rank, levelCode, primaryRu, sensesShard, paradigmShard] = row
  const pos = POS.valueOf(posCode)
  const level = LEVEL.valueOf(levelCode)
  if (!pos) {
    throw new Error(`content loader: index row "${id}" has unknown pos code ${posCode}`)
  }
  if (!level) {
    throw new Error(`content loader: index row "${id}" has unknown level code ${levelCode}`)
  }
  const { lemma } = decodeWordId(id)
  return { lemma, pos, rank, level, primaryRu, sensesShard, paradigmShard }
}

export function loadIndex(): Promise<WordIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = fetchJson(contentUrl('index.json'))
      .then((json) => {
        // `index.json` itself is not re-validated (budget), but the *shape* Zod already
        // proved at build time is trusted here purely as a TS cast, not a runtime check —
        // hence going through the schema's inferred type rather than a raw `as`.
        const rows = json as IndexJson
        return rows.map(decodeIndexRow)
      })
      .catch((error: unknown) => {
        indexPromise = null
        throw error
      })
  }
  return indexPromise
}

/** Re-validates one row with Zod — used only by tests / dev tooling that want the real
 *  runtime guarantee `IndexJsonSchema` offers, without paying for it on every production
 *  load (see file header). Not part of the hot path. */
export function parseIndexJsonForTest(json: unknown): IndexJson {
  return IndexJsonSchema.parse(json)
}

// ---------------------------------------------------------------------------
// senses/NNN.json shards.
// ---------------------------------------------------------------------------

const sensesShardCache = new Map<number, Promise<Map<WordId, Sense[]>>>()

export function loadSensesShard(n: number): Promise<Map<WordId, Sense[]>> {
  let promise = sensesShardCache.get(n)
  if (!promise) {
    promise = fetchJson(contentUrl(`senses/${shardFileStem(n)}.json`))
      .then((json) => {
        const shard = json as SensesShard
        const map = new Map<WordId, Sense[]>()
        for (const [id, entries] of Object.entries(shard)) {
          map.set(
            id,
            entries.map((entry) => ({ ru: entry.ru, en: entry.en, primary: entry.primary })),
          )
        }
        return map
      })
      .catch((error: unknown) => {
        sensesShardCache.delete(n)
        throw error
      })
    sensesShardCache.set(n, promise)
  }
  return promise
}

// ---------------------------------------------------------------------------
// paradigms/NNN.json shards.
// ---------------------------------------------------------------------------

const paradigmShardCache = new Map<number, Promise<Map<WordId, Paradigm>>>()

export function loadParadigmShard(n: number): Promise<Map<WordId, Paradigm>> {
  let promise = paradigmShardCache.get(n)
  if (!promise) {
    promise = fetchJson(contentUrl(`paradigms/${shardFileStem(n)}.json`))
      .then((json) => {
        const shard = json as ParadigmsShard
        const map = new Map<WordId, Paradigm>()
        for (const [id, entry] of Object.entries(shard)) {
          map.set(id, {
            forms: entry.forms.map(decodeForm),
            dominantGender:
              entry.dominantGender === undefined ? undefined : GENDER.valueOf(entry.dominantGender),
          })
        }
        return map
      })
      .catch((error: unknown) => {
        paradigmShardCache.delete(n)
        throw error
      })
    paradigmShardCache.set(n, promise)
  }
  return promise
}

// ---------------------------------------------------------------------------
// Test-only reset — Vitest module state otherwise leaks between test files that both
// import this singleton cache.
// ---------------------------------------------------------------------------

export function __resetLoaderCachesForTest(): void {
  manifestPromise = null
  indexPromise = null
  sensesShardCache.clear()
  paradigmShardCache.clear()
}
