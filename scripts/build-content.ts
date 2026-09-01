#!/usr/bin/env node
/**
 * Build-time content pipeline: `data/**` -> `public/content/**`.
 *
 * Run via `npm run build:content` (also wired into `prebuild`, see package.json).
 * Pass `--dev` to additionally emit `public/content/dev/raw-tags.json` (not deployed,
 * `public/content/` is gitignored wholesale).
 *
 * See `spec/tasks/02-content-pipeline.md` for the full spec this implements.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

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
  SensesShardSchema,
  WordsJsonSchema,
  type IndexRow,
  type Manifest,
  type ParadigmEntry,
  type RawParadigm,
  type RawWord,
  type SenseEntry,
} from '../src/content/content.schema.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')
const OUT_DIR = join(ROOT, 'public', 'content')

const DEV_MODE = process.argv.includes('--dev')

// Budgets from spec §9.
const INDEX_GZIP_WARN_BYTES = 150 * 1024
const PRECACHE_WARN_BYTES = 500 * 1024
const PARADIGMS_GZIP_BUDGET_BYTES = 1.2 * 1024 * 1024

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

function main(): void {
  const startedAt = Date.now()
  console.log('Content pipeline: reading data/**...')

  const wordsRaw = readFileSync(join(DATA_DIR, 'words.json'))
  const inflectionsRaw = readFileSync(join(DATA_DIR, 'inflections.json'))

  const wordsJson = WordsJsonSchema.parse(JSON.parse(wordsRaw.toString('utf8')))
  const inflectionsJson = InflectionsJsonSchema.parse(JSON.parse(inflectionsRaw.toString('utf8')))

  console.log(`  words.json: ${wordsJson.words.length} words`)
  console.log(`  inflections.json: ${Object.keys(inflectionsJson.paradigms).length} paradigms`)

  // contentVersion = sha256(words.json bytes ++ inflections.json bytes), first 12 hex chars.
  const contentVersion = createHash('sha256')
    .update(wordsRaw)
    .update(inflectionsRaw)
    .digest('hex')
    .slice(0, 12)

  const discrepancies: Discrepancy[] = []

  // -------------------------------------------------------------------------
  // Join words <-> paradigms, tolerant of mismatches (spec §6).
  // -------------------------------------------------------------------------

  const paradigmsByWordId = new Map<string, RawParadigm>(Object.entries(inflectionsJson.paradigms))
  const wordIds = new Set(wordsJson.words.map((w) => wordId(w.lemma, w.pos)))

  const wordsWithoutParadigm: RawWord[] = []
  for (const w of wordsJson.words) {
    if (!paradigmsByWordId.has(wordId(w.lemma, w.pos))) {
      wordsWithoutParadigm.push(w)
    }
  }
  const orphanParadigmIds: string[] = []
  for (const id of paradigmsByWordId.keys()) {
    if (!wordIds.has(id)) orphanParadigmIds.push(id)
  }
  orphanParadigmIds.sort()

  if (wordsWithoutParadigm.length > 0) {
    const byPos = new Map<string, number>()
    for (const w of wordsWithoutParadigm) byPos.set(w.pos, (byPos.get(w.pos) ?? 0) + 1)
    const breakdown = [...byPos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pos, n]) => `${pos} ${n}`)
      .join(', ')
    discrepancies.push({
      kind: 'words-without-paradigm',
      detail: `${wordsWithoutParadigm.length} words have no paradigm (${breakdown}): ${wordsWithoutParadigm
        .map((w) => wordId(w.lemma, w.pos))
        .sort()
        .join(', ')}`,
    })
  }
  if (orphanParadigmIds.length > 0) {
    discrepancies.push({
      kind: 'orphan-paradigms',
      detail: `${orphanParadigmIds.length} paradigms have no matching word, excluded from index.json (still written to their paradigm shard, unreachable from the index): ${orphanParadigmIds.join(', ')}`,
    })
  }

  // -------------------------------------------------------------------------
  // Build senses shards + index rows.
  // -------------------------------------------------------------------------

  const sensesShards: Array<Map<string, SenseEntry[]>> = Array.from(
    { length: SENSES_SHARD_COUNT },
    () => new Map<string, SenseEntry[]>(),
  )

  const indexRows: IndexRow[] = []

  // Sorted by frequency.rank per spec §3.
  const sortedWords = [...wordsJson.words].sort((a, b) => a.frequency.rank - b.frequency.rank)

  for (const w of sortedWords) {
    const id = wordId(w.lemma, w.pos)

    const senseEntries: SenseEntry[] = w.senses.map((s) => ({
      ru: s.translation_ru,
      en: s.gloss_en ?? undefined,
      primary: s.primary,
    }))
    const sShard = senseShardIndex(id)
    sensesShards[sShard]!.set(id, senseEntries)

    const primarySense = w.senses.find((s) => s.primary) ?? w.senses[0]!
    const primaryRu = primarySense.translation_ru[0]!

    const hasParadigm = paradigmsByWordId.has(id)
    const paradigmShard = hasParadigm ? paradigmShardIndex(id) : -1

    indexRows.push([
      id,
      POS.codeOf(w.pos),
      w.frequency.rank,
      LEVEL.codeOf(w.introduced_at),
      primaryRu,
      sShard,
      paradigmShard,
    ])
  }

  // -------------------------------------------------------------------------
  // Build paradigms shards.
  // -------------------------------------------------------------------------

  const paradigmsShards: Array<Map<string, ParadigmEntry>> = Array.from(
    { length: PARADIGMS_SHARD_COUNT },
    () => new Map<string, ParadigmEntry>(),
  )

  let totalForms = 0
  let multiGenderNounCount = 0
  const devRawTags: Record<string, string[]> = {}

  for (const [id, paradigm] of paradigmsByWordId) {
    // Orphan paradigms (no matching word, reported above) are still written to their
    // shard: dropping real inflection data would be wasteful, and no acceptance
    // criterion asks for it to be removed — only that no word is indexed for it. They
    // simply end up unreachable from index.json (nothing points at their shard entry).
    const encodedForms = paradigm.forms.map((f) => encodeForm(f))
    totalForms += encodedForms.length

    let dominantGender: number | undefined
    if (paradigm.pos === 'NOUN') {
      const genders = paradigm.forms
        .map((f) => f.gender)
        .filter((g): g is GenderValue => g !== undefined)
      const distinct = new Set(genders)
      if (distinct.size > 1) multiGenderNounCount++
      const dominant = computeDominantGender(genders)
      dominantGender = dominant === undefined ? undefined : GENDER.codeOf(dominant)
    }

    const entry: ParadigmEntry =
      dominantGender === undefined
        ? { forms: encodedForms }
        : { forms: encodedForms, dominantGender }

    const shard = paradigmShardIndex(id)
    paradigmsShards[shard]!.set(id, entry)

    if (DEV_MODE) {
      devRawTags[id] = paradigm.forms.map((f) => f.raw_tag)
    }
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
  for (const shard of sensesShards) {
    SensesShardSchema.parse(Object.fromEntries(shard))
  }
  for (const shard of paradigmsShards) {
    ParadigmsShardSchema.parse(Object.fromEntries(shard))
  }

  // -------------------------------------------------------------------------
  // Write artifacts. Fresh output dir each run for determinism (no stale files).
  // -------------------------------------------------------------------------

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(join(OUT_DIR, 'senses'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'paradigms'), { recursive: true })

  const indexSize = writeJson(join(OUT_DIR, 'index.json'), indexRows, false)

  let sensesRaw = 0
  let sensesGzip = 0
  sensesShards.forEach((shard, i) => {
    // Deterministic key order: sort wordIds so byte output never depends on Map
    // insertion order (which itself depends on sortedWords / iteration order).
    const obj = Object.fromEntries([...shard.entries()].sort(([a], [b]) => a.localeCompare(b)))
    const { raw, gzip } = writeJson(join(OUT_DIR, 'senses', `${shardFileStem(i)}.json`), obj, false)
    sensesRaw += raw
    sensesGzip += gzip
  })

  let paradigmsRaw = 0
  let paradigmsGzip = 0
  paradigmsShards.forEach((shard, i) => {
    const obj = Object.fromEntries([...shard.entries()].sort(([a], [b]) => a.localeCompare(b)))
    const { raw, gzip } = writeJson(
      join(OUT_DIR, 'paradigms', `${shardFileStem(i)}.json`),
      obj,
      false,
    )
    paradigmsRaw += raw
    paradigmsGzip += gzip
  })

  const manifest: Manifest = {
    contentVersion,
    // Derived from the input data's own `generated_at` timestamps, not wall-clock time:
    // acceptance requires re-running the build to produce a byte-identical result, which
    // wall-clock `new Date()` would break. The later of the two source timestamps is used.
    generatedAt: [wordsJson.generated_at, inflectionsJson.generated_at].sort().at(-1)!,
    counts: {
      words: wordsJson.words.length,
      paradigms: paradigmsByWordId.size,
      forms: totalForms,
    },
    shards: {
      senses: SENSES_SHARD_COUNT,
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

  const precacheTotal = indexSize.gzip + sensesGzip + manifestSize.gzip
  const elapsedMs = Date.now() - startedAt

  console.log('')
  console.log('=== Content pipeline report ===')
  console.log(`words:     ${wordsJson.words.length}`)
  console.log(
    `paradigms: ${paradigmsByWordId.size} (of which ${orphanParadigmIds.length} orphan, unreferenced by any word)`,
  )
  console.log(`forms:     ${totalForms}`)
  console.log(`contentVersion: ${contentVersion}`)
  console.log('')
  console.log('Artifact sizes (raw / gzip):')
  console.log(
    `  index.json              ${fmtBytes(indexSize.raw).padStart(10)} / ${fmtBytes(indexSize.gzip).padStart(10)}`,
  )
  console.log(
    `  senses/*.json  (${String(SENSES_SHARD_COUNT).padStart(2)} shards) ${fmtBytes(sensesRaw).padStart(10)} / ${fmtBytes(sensesGzip).padStart(10)}`,
  )
  console.log(
    `  paradigms/*.json (${PARADIGMS_SHARD_COUNT} shards) ${fmtBytes(paradigmsRaw).padStart(10)} / ${fmtBytes(paradigmsGzip).padStart(10)}`,
  )
  console.log(
    `  manifest.json            ${fmtBytes(manifestSize.raw).padStart(10)} / ${fmtBytes(manifestSize.gzip).padStart(10)}`,
  )
  console.log(`  precache total (index+senses+manifest): ${fmtBytes(precacheTotal)}`)
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
  if (indexSize.gzip > INDEX_GZIP_WARN_BYTES) {
    warnings.push(
      `index.json gzip ${fmtBytes(indexSize.gzip)} exceeds ${fmtBytes(INDEX_GZIP_WARN_BYTES)} budget`,
    )
  }
  if (precacheTotal > PRECACHE_WARN_BYTES) {
    warnings.push(
      `precache total ${fmtBytes(precacheTotal)} exceeds ${fmtBytes(PRECACHE_WARN_BYTES)} budget`,
    )
  }
  if (paradigmsGzip > PARADIGMS_GZIP_BUDGET_BYTES) {
    warnings.push(
      `paradigms gzip total ${fmtBytes(paradigmsGzip)} exceeds ${fmtBytes(PARADIGMS_GZIP_BUDGET_BYTES)} budget`,
    )
  }
  if (warnings.length > 0) {
    console.warn('WARNINGS:')
    for (const w of warnings) console.warn(`  - ${w}`)
  } else {
    console.log('All size budgets OK.')
  }

  console.log('')
  console.log(`Done in ${elapsedMs}ms. Wrote ${OUT_DIR}`)
}

main()
