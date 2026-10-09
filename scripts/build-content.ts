#!/usr/bin/env node
/**
 * Build-time content pipeline: `data/**` -> `public/content/**`.
 *
 * Run via `npm run build:content` (also wired into `prebuild`, see package.json).
 * Pass `--dev` to additionally emit `public/content/dev/raw-tags.json` (not deployed,
 * `public/content/` is gitignored wholesale).
 *
 * See `spec/tasks/02-content-pipeline.md` for the original spec and
 * `spec/tasks/47-content-pipeline-v2.md` for the v2 dictionary (senses with ru/by/ua
 * translations and levels, lazy `sense-details/` shards, paradigm aliases).
 *
 * `buildWordArtifacts` is pure and exported for tests; `main` does the file I/O.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { z } from 'zod'

import {
  CODEC_DICTIONARIES,
  computeDominantGender,
  encodeForm,
  GENDER,
  type GenderValue,
  LEVEL,
  paradigmShardIndex,
  PARADIGMS_SHARD_COUNT,
  POS,
  senseShardIndex,
  SENSES_SHARD_COUNT,
  shardFileStem,
} from '../src/content/codec.ts'
import {
  IndexJsonSchema,
  InflectionsJsonSchema,
  ManifestSchema,
  ParadigmsShardSchema,
  SenseDetailsShardSchema,
  SensesShardSchema,
  WordsJsonV2Schema,
  type IndexRow,
  type LevelTriple,
  type Manifest,
  type ParadigmEntry,
  type RawParadigm,
  type RawSenseV2,
  type RawWordV2,
  type SenseDetailsEntry,
  type SenseEntry,
} from '../src/content/content.schema.ts'
import { createParadigmResolver, type ParadigmVia } from './paradigm-aliases.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')
const OUT_DIR = join(ROOT, 'public', 'content')

const DEV_MODE = process.argv.includes('--dev')

// Budgets from spec 02 §9 and 47 «Бюджет».
const INDEX_GZIP_WARN_BYTES = 150 * 1024
// What the service worker precaches from `content/`: manifest.json + index.json (task 25 moved
// `senses/` to a prewarmed runtime cache).
const PRECACHE_WARN_BYTES = 500 * 1024
const SENSES_GZIP_BUDGET_BYTES = 450 * 1024
const PARADIGMS_GZIP_BUDGET_BYTES = 1.2 * 1024 * 1024

const RenamesJsonSchema = z.object({
  fromContent: z.string(),
  renames: z.record(z.string(), z.string()),
})

interface Discrepancy {
  kind: string
  detail: string
}

function fmtBytes(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`
}

function wordId(lemma: string, pos: string): string {
  return `${lemma}|${pos}`
}

function writeJson(path: string, value: unknown, pretty: boolean): { raw: number; gzip: number } {
  const json = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)
  const buf = Buffer.from(json, 'utf8')
  writeFileSync(path, buf)
  const gzip = gzipSync(buf).length
  return { raw: buf.length, gzip }
}

/** Shards as plain objects with sorted keys: byte output never depends on Map insertion order. */
function writeShards<T>(
  dir: string,
  shards: ReadonlyArray<ReadonlyMap<string, T>>,
): { raw: number; gzip: number } {
  mkdirSync(join(OUT_DIR, dir), { recursive: true })
  const total = { raw: 0, gzip: 0 }
  shards.forEach((shard, i) => {
    const obj = Object.fromEntries([...shard.entries()].sort(([a], [b]) => a.localeCompare(b)))
    const { raw, gzip } = writeJson(join(OUT_DIR, dir, `${shardFileStem(i)}.json`), obj, false)
    total.raw += raw
    total.gzip += gzip
  })
  return total
}

function emptyShards<T>(count: number): Array<Map<string, T>> {
  return Array.from({ length: count }, () => new Map<string, T>())
}

// ---------------------------------------------------------------------------
// One word -> its index row, senses-shard entry and sense details (pure).
// ---------------------------------------------------------------------------

/** `LEVEL` codes in `LANG_PROFILES` order: `[ru, by, ua]`. */
function levelCodes(levels: LevelTriple): [number, number, number] {
  return [LEVEL.codeOf(levels.ru), LEVEL.codeOf(levels.by), LEVEL.codeOf(levels.ua)]
}

export interface WordArtifacts {
  readonly row: IndexRow
  /** The primary sense first, the rest in source order (`być:copula` is second in the file). */
  readonly senses: SenseEntry[]
  /** `sense_id` -> Polish gloss and example, by/ua translations, for `sense-details/`. */
  readonly details: ReadonlyArray<readonly [string, SenseDetailsEntry]>
}

/** @param paradigmShard the word's paradigm shard, `-1` when it has no paradigm */
export function buildWordArtifacts(word: RawWordV2, paradigmShard: number): WordArtifacts {
  const id = wordId(word.lemma, word.pos)
  const primary = word.senses.find((s) => s.primary)
  if (!primary) throw new Error(`build-content: ${id} has no primary sense`)
  const ordered: RawSenseV2[] = [primary, ...word.senses.filter((s) => s !== primary)]

  const [levelRu, levelBy, levelUa] = levelCodes(primary.introduced_at)
  const row: IndexRow = [
    id,
    POS.codeOf(word.pos),
    word.frequency.rank,
    levelRu,
    levelBy,
    levelUa,
    primary.translation_ru[0]!,
    senseShardIndex(id),
    paradigmShard,
  ]
  const senses = ordered.map((s): SenseEntry => ({
    id: s.sense_id,
    ru: s.translation_ru,
    lv: levelCodes(s.introduced_at),
    primary: s.primary,
  }))
  const details = ordered.map(
    (s) =>
      [
        s.sense_id,
        { gl: s.gloss_pl, ex: s.example_pl, by: s.translation_by, ua: s.translation_ua },
      ] as const,
  )
  return { row, senses, details }
}

// ---------------------------------------------------------------------------
// Paradigm encoding.
// ---------------------------------------------------------------------------

function encodeParadigm(paradigm: RawParadigm): { entry: ParadigmEntry; multiGender: boolean } {
  const forms = paradigm.forms.map((f) => encodeForm(f))
  if (paradigm.pos !== 'NOUN') return { entry: { forms }, multiGender: false }

  const genders = paradigm.forms
    .map((f) => f.gender)
    .filter((g): g is GenderValue => g !== undefined)
  const dominant = computeDominantGender(genders)
  return {
    entry: dominant === undefined ? { forms } : { forms, dominantGender: GENDER.codeOf(dominant) },
    multiGender: new Set(genders).size > 1,
  }
}

function main(): void {
  const startedAt = Date.now()
  console.log('Content pipeline: reading data/**...')

  const wordsRaw = readFileSync(join(DATA_DIR, 'words.json'))
  const inflectionsRaw = readFileSync(join(DATA_DIR, 'inflections.json'))

  const wordsJson = WordsJsonV2Schema.parse(JSON.parse(wordsRaw.toString('utf8')))
  const inflectionsJson = InflectionsJsonSchema.parse(JSON.parse(inflectionsRaw.toString('utf8')))
  const { renames } = RenamesJsonSchema.parse(
    JSON.parse(readFileSync(join(DATA_DIR, 'word-id-renames.json'), 'utf8')),
  )

  console.log(`  words.json: ${wordsJson.words.length} words (schema_version 2)`)
  console.log(`  inflections.json: ${Object.keys(inflectionsJson.paradigms).length} paradigms`)

  // contentVersion = sha256(words.json bytes ++ inflections.json bytes), first 12 hex chars.
  const contentVersion = createHash('sha256')
    .update(wordsRaw)
    .update(inflectionsRaw)
    .digest('hex')
    .slice(0, 12)

  const discrepancies: Discrepancy[] = []

  // -------------------------------------------------------------------------
  // Duplicates would silently overwrite each other in the index and the shards.
  // -------------------------------------------------------------------------

  const duplicates: string[] = []
  const seenWordIds = new Set<string>()
  const seenSenseIds = new Set<string>()
  for (const w of wordsJson.words) {
    const id = wordId(w.lemma, w.pos)
    if (seenWordIds.has(id)) duplicates.push(`wordId ${id}`)
    seenWordIds.add(id)
    for (const s of w.senses) {
      if (seenSenseIds.has(s.sense_id)) duplicates.push(`sense_id ${s.sense_id}`)
      seenSenseIds.add(s.sense_id)
    }
  }
  if (duplicates.length > 0) {
    throw new Error(`build-content: duplicates in words.json: ${duplicates.join(', ')}`)
  }

  // -------------------------------------------------------------------------
  // Join words <-> paradigms through the aliases (task 47 §3), tolerant of mismatches.
  // -------------------------------------------------------------------------

  const paradigmsById = new Map<string, RawParadigm>(Object.entries(inflectionsJson.paradigms))
  const resolveParadigm = createParadigmResolver(new Set(paradigmsById.keys()), renames)

  const paradigmsShards = emptyShards<ParadigmEntry>(PARADIGMS_SHARD_COUNT)
  let totalForms = 0
  let multiGenderNounCount = 0
  const devRawTags: Record<string, string[]> = {}

  /** Writes `paradigm` under `key` — the word's own id, so the runtime finds it by `wordId`. */
  function writeParadigm(key: string, paradigm: RawParadigm): number {
    const { entry, multiGender } = encodeParadigm(paradigm)
    const shard = paradigmShardIndex(key)
    paradigmsShards[shard]!.set(key, entry)
    totalForms += entry.forms.length
    if (multiGender) multiGenderNounCount++
    if (DEV_MODE) devRawTags[key] = paradigm.forms.map((f) => f.raw_tag)
    return shard
  }

  // Sorted by frequency.rank per spec 02 §3.
  const sortedWords = [...wordsJson.words].sort((a, b) => a.frequency.rank - b.frequency.rank)

  const indexRows: IndexRow[] = []
  const sensesShards = emptyShards<SenseEntry[]>(SENSES_SHARD_COUNT)
  const senseDetailsShards = emptyShards<SenseDetailsEntry>(SENSES_SHARD_COUNT)
  const usedParadigmIds = new Set<string>()
  const aliases: string[] = []
  const withoutParadigm: Array<{ id: string; pos: string; via: ParadigmVia }> = []

  for (const w of sortedWords) {
    const id = wordId(w.lemma, w.pos)
    const { paradigmId, via } = resolveParadigm(id, w.pos)
    let paradigmShard = -1
    if (paradigmId === null) {
      withoutParadigm.push({ id, pos: w.pos, via })
    } else {
      paradigmShard = writeParadigm(id, paradigmsById.get(paradigmId)!)
      usedParadigmIds.add(paradigmId)
      if (paradigmId !== id) aliases.push(`${id} <- ${paradigmId} (${via})`)
    }

    const { row, senses, details } = buildWordArtifacts(w, paradigmShard)
    indexRows.push(row)
    const shard = senseShardIndex(id)
    sensesShards[shard]!.set(id, senses)
    for (const [senseId, entry] of details) senseDetailsShards[shard]!.set(senseId, entry)
  }

  // Orphan paradigms (used by no word, not even through an alias) are still written under
  // their own key — dropping real inflection data would be wasteful — but nothing in
  // index.json points at them. A key that is some word's own id is not written: that word
  // deliberately has another paradigm or none (an override / a POS without paradigms).
  const orphanParadigmIds = [...paradigmsById.keys()].filter((id) => !usedParadigmIds.has(id))
  orphanParadigmIds.sort()
  for (const id of orphanParadigmIds) {
    if (!seenWordIds.has(id)) writeParadigm(id, paradigmsById.get(id)!)
  }

  if (aliases.length > 0) {
    discrepancies.push({
      kind: 'paradigm-alias',
      detail: `${aliases.length} words use the paradigm of their v1 wordId (scripts/paradigm-aliases.ts): ${aliases.join(', ')}`,
    })
  }
  if (withoutParadigm.length > 0) {
    const breakdown = (key: 'pos' | 'via') => {
      const counts = new Map<string, number>()
      for (const w of withoutParadigm) counts.set(w[key], (counts.get(w[key]) ?? 0) + 1)
      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')
    }
    discrepancies.push({
      kind: 'words-without-paradigm',
      detail: `${withoutParadigm.length} words have no paradigm (${breakdown('pos')}; reason: ${breakdown('via')}): ${withoutParadigm
        .map((w) => w.id)
        .sort()
        .join(', ')}`,
    })
  }
  if (orphanParadigmIds.length > 0) {
    discrepancies.push({
      kind: 'orphan-paradigms',
      detail: `${orphanParadigmIds.length} paradigms are used by no word, excluded from index.json (still written to their paradigm shard unless the key is a word's own id, unreachable from the index): ${orphanParadigmIds.join(', ')}`,
    })
  }
  if (multiGenderNounCount > 0) {
    discrepancies.push({
      kind: 'multi-gender-nouns',
      detail: `${multiGenderNounCount} nouns have more than one distinct gender value across their forms; gender kept per-form, dominantGender recorded on the paradigm entry`,
    })
  }

  // -------------------------------------------------------------------------
  // Validate outputs before writing (spec §8: build fails on violation).
  // -------------------------------------------------------------------------

  console.log('Validating output artifacts...')
  IndexJsonSchema.parse(indexRows)
  for (const shard of sensesShards) SensesShardSchema.parse(Object.fromEntries(shard))
  for (const shard of senseDetailsShards) SenseDetailsShardSchema.parse(Object.fromEntries(shard))
  for (const shard of paradigmsShards) ParadigmsShardSchema.parse(Object.fromEntries(shard))

  // -------------------------------------------------------------------------
  // Write artifacts. Fresh output dir each run for determinism (no stale files).
  // -------------------------------------------------------------------------

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const indexSize = writeJson(join(OUT_DIR, 'index.json'), indexRows, false)
  const sensesSize = writeShards('senses', sensesShards)
  const senseDetailsSize = writeShards('sense-details', senseDetailsShards)
  const paradigmsSize = writeShards('paradigms', paradigmsShards)
  const paradigmEntries = paradigmsShards.reduce((n, shard) => n + shard.size, 0)

  const manifest: Manifest = {
    contentVersion,
    // Derived from the input data's own `generated_at` timestamps, not wall-clock time:
    // acceptance requires re-running the build to produce a byte-identical result, which
    // wall-clock `new Date()` would break. The later of the two source timestamps is used.
    generatedAt: [wordsJson.generated_at, inflectionsJson.generated_at].sort().at(-1)!,
    counts: {
      words: wordsJson.words.length,
      paradigms: paradigmEntries,
      forms: totalForms,
    },
    shards: {
      senses: SENSES_SHARD_COUNT,
      senseDetails: SENSES_SHARD_COUNT,
      paradigms: PARADIGMS_SHARD_COUNT,
    },
    codec: {
      pos: [...CODEC_DICTIONARIES.pos],
      level: [...CODEC_DICTIONARIES.level],
      number: [...CODEC_DICTIONARIES.number],
      case: [...CODEC_DICTIONARIES.case],
      gender: [...CODEC_DICTIONARIES.gender],
      degree: [...CODEC_DICTIONARIES.degree],
      tense: [...CODEC_DICTIONARIES.tense],
      mood: [...CODEC_DICTIONARIES.mood],
      aspect: [...CODEC_DICTIONARIES.aspect],
      person: [...CODEC_DICTIONARIES.person],
    },
  }
  ManifestSchema.parse(manifest)
  const manifestSize = writeJson(join(OUT_DIR, 'manifest.json'), manifest, true)

  if (DEV_MODE) {
    mkdirSync(join(OUT_DIR, 'dev'), { recursive: true })
    writeJson(join(OUT_DIR, 'dev', 'raw-tags.json'), devRawTags, false)
  }

  // -------------------------------------------------------------------------
  // Report.
  // -------------------------------------------------------------------------

  const precacheTotal = indexSize.gzip + manifestSize.gzip
  const elapsedMs = Date.now() - startedAt
  const sizeLine = (label: string, size: { raw: number; gzip: number }) =>
    console.log(
      `  ${label.padEnd(34)} ${fmtBytes(size.raw).padStart(10)} / ${fmtBytes(size.gzip).padStart(10)}`,
    )

  console.log('')
  console.log('=== Content pipeline report ===')
  console.log(`words:     ${wordsJson.words.length} (0 duplicate wordIds / sense_ids)`)
  console.log(`senses:    ${seenSenseIds.size}`)
  console.log(
    `paradigms: ${paradigmEntries} written (${usedParadigmIds.size} of ${paradigmsById.size} in inflections.json used by words, ${aliases.length} through an alias; ${orphanParadigmIds.length} orphan)`,
  )
  console.log(`words without paradigm: ${withoutParadigm.length}`)
  console.log(`forms:     ${totalForms}`)
  console.log(`contentVersion: ${contentVersion}`)
  console.log('')
  console.log('Artifact sizes (raw / gzip):')
  sizeLine('index.json', indexSize)
  sizeLine(`senses/*.json (${SENSES_SHARD_COUNT} shards)`, sensesSize)
  sizeLine(`sense-details/*.json (${SENSES_SHARD_COUNT} shards, lazy)`, senseDetailsSize)
  sizeLine(`paradigms/*.json (${PARADIGMS_SHARD_COUNT} shards)`, paradigmsSize)
  sizeLine('manifest.json', manifestSize)
  console.log(`  precache total (index+manifest): ${fmtBytes(precacheTotal)}`)
  console.log('')

  if (discrepancies.length > 0) {
    console.log('Discrepancies:')
    for (const d of discrepancies) {
      console.log(`  [${d.kind}] ${d.detail}`)
    }
  } else {
    console.log('Discrepancies: none')
  }
  console.log('')

  const warnings: string[] = []
  const budget = (label: string, actual: number, limit: number) => {
    if (actual > limit)
      warnings.push(`${label} ${fmtBytes(actual)} exceeds ${fmtBytes(limit)} budget`)
  }
  budget('index.json gzip', indexSize.gzip, INDEX_GZIP_WARN_BYTES)
  budget('precache total', precacheTotal, PRECACHE_WARN_BYTES)
  budget('senses gzip total', sensesSize.gzip, SENSES_GZIP_BUDGET_BYTES)
  budget('paradigms gzip total', paradigmsSize.gzip, PARADIGMS_GZIP_BUDGET_BYTES)
  if (warnings.length > 0) {
    console.warn('WARNINGS:')
    for (const w of warnings) console.warn(`  - ${w}`)
  } else {
    console.log('All size budgets OK.')
  }

  console.log('')
  console.log(`Done in ${elapsedMs}ms. Wrote ${OUT_DIR}`)
}

if (import.meta.main) {
  main()
}
