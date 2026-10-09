#!/usr/bin/env node
/**
 * Assembles `data/words.json` (schema_version 2) from the edited chunks in
 * `data/words_parts/output/words_NNN.json`.
 *
 * Run via `npm run assemble:words`. Deliberately NOT part of `prebuild`: the content build
 * reads the committed `data/words.json`, re-assembling it from the chunks is an editor's
 * conscious act (`npm run assemble:words && npm run build:content`).
 *
 * Also writes `data/word-id-renames.json` (old `wordId` -> new) — but only on the first run,
 * while `data/words.json` still holds schema_version 1. See `spec/tasks/46-assemble-words-v2.md`.
 *
 * The core (`assemble`, `buildWordsJson`, `buildRenames`) is pure and exported for tests; `run`
 * does the file I/O and returns the exit code.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { LEVEL_VALUES, type LevelValue } from '../src/content/codec.ts'
import { RawWordV2Schema, type RawWordV2, type WordsJsonV2 } from '../src/content/content.schema.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')

const SOURCE = 'words_parts/output'
const PROFILES = ['ru', 'by', 'ua'] as const
const MAX_PRINTED_LINES = 50

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export const FixupsSchema = z.object({
  dropWords: z.array(
    z.object({
      rank: z.number().int().positive(),
      lemma: z.string(),
      pos: z.string(),
      /** `wordId` of the surviving duplicate that absorbs this word's progress. */
      mergeInto: z.string(),
    }),
  ),
})

export type Fixups = z.infer<typeof FixupsSchema>

const ChunkSchema = z.object({
  part: z.number().int(),
  range: z.tuple([z.number().int(), z.number().int()]),
  // Words are validated one by one below, so an error can name the offending word.
  words: z.array(z.unknown()),
})

/** One chunk file: its name (for error messages) and its parsed JSON, in part order. */
export interface ChunkInput {
  file: string
  data: unknown
}

/** The part of the previous (schema_version 1) `words.json` that the rename map needs. */
const PreviousWordsSchema = z.object({
  words: z.array(
    z.object({ lemma: z.string(), pos: z.string(), frequency: z.object({ rank: z.number() }) }),
  ),
})

type PreviousWord = z.infer<typeof PreviousWordsSchema>['words'][number]

export interface DroppedWord {
  word: RawWordV2
  mergeInto: string
}

export interface AssembleResult {
  /** Surviving words, sorted by `frequency.rank`. */
  words: RawWordV2[]
  dropped: DroppedWord[]
  errors: string[]
  warnings: string[]
}

interface Entry {
  word: RawWordV2
  /** `words_007.json #12`, for error messages. */
  at: string
}

export function wordId(word: { lemma: string; pos: string }): string {
  return `${word.lemma}|${word.pos}`
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return groups
}

function earliest(levels: LevelValue[]): LevelValue {
  return levels.reduce((a, b) => (LEVEL_VALUES.indexOf(b) < LEVEL_VALUES.indexOf(a) ? b : a))
}

// ---------------------------------------------------------------------------
// Step 1-2: chunks -> validated words
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function describeRaw(raw: unknown): string {
  return isRecord(raw) ? `${String(raw.lemma)}|${String(raw.pos)}` : String(raw)
}

function hasGlossEn(raw: unknown): boolean {
  return (
    isRecord(raw) &&
    Array.isArray(raw.senses) &&
    raw.senses.some((sense) => isRecord(sense) && 'gloss_en' in sense)
  )
}

function readChunks(chunks: ChunkInput[], errors: string[]): Entry[] {
  const entries: Entry[] = []
  let previousEnd = 0
  chunks.forEach(({ file, data }, index) => {
    const parsed = ChunkSchema.safeParse(data)
    if (!parsed.success) {
      errors.push(`${file}: not a { part, range, words } chunk`)
      return
    }
    const { part, range, words } = parsed.data
    if (part !== index + 1) errors.push(`${file}: part is ${part}, expected ${index + 1}`)
    if (range[0] <= previousEnd) {
      errors.push(`${file}: range [${range}] overlaps the previous chunk (ends at ${previousEnd})`)
    }
    if (words.length !== range[1] - range[0] + 1) {
      errors.push(
        `${file}: range [${range}] expects ${range[1] - range[0] + 1} words, has ${words.length}`,
      )
    }
    previousEnd = range[1]

    words.forEach((raw, i) => {
      const at = `${file} #${i}`
      if (hasGlossEn(raw)) {
        errors.push(`${at} ${describeRaw(raw)}: gloss_en must be replaced by gloss_pl`)
      }
      const result = RawWordV2Schema.safeParse(raw)
      if (result.success) {
        entries.push({ word: result.data, at })
        return
      }
      for (const issue of result.error.issues) {
        errors.push(`${at} ${describeRaw(raw)}: ${issue.path.join('.')}: ${issue.message}`)
      }
    })
  })
  return entries
}

// ---------------------------------------------------------------------------
// Step 3: dropWords
// ---------------------------------------------------------------------------

function dropWords(
  entries: Entry[],
  fixups: Fixups,
  errors: string[],
): { kept: Entry[]; dropped: DroppedWord[] } {
  const dropped: DroppedWord[] = []
  const droppedEntries = new Set<Entry>()
  for (const fixup of fixups.dropWords) {
    const entry = entries.find((e) => e.word.frequency.rank === fixup.rank)
    if (!entry || entry.word.lemma !== fixup.lemma || entry.word.pos !== fixup.pos) {
      errors.push(
        `dropWords: rank ${fixup.rank} is ${entry ? wordId(entry.word) : 'missing'}, expected ${fixup.lemma}|${fixup.pos}`,
      )
      continue
    }
    droppedEntries.add(entry)
    dropped.push({ word: entry.word, mergeInto: fixup.mergeInto })
  }
  const kept = entries.filter((e) => !droppedEntries.has(e))

  const keptIds = new Set(kept.map((e) => wordId(e.word)))
  for (const { word, mergeInto } of dropped) {
    if (!keptIds.has(mergeInto)) {
      errors.push(
        `dropWords: ${wordId(word)} merges into ${mergeInto}, which is not in the dictionary`,
      )
    }
  }
  return { kept, dropped }
}

// ---------------------------------------------------------------------------
// Step 4: invariants
// ---------------------------------------------------------------------------

/** One error per key that occurs more than once. */
function reportDuplicates<T>(
  label: string,
  items: T[],
  key: (item: T) => string,
  at: (item: T) => string,
  errors: string[],
): void {
  for (const [k, group] of groupBy(items, key)) {
    if (group.length > 1) errors.push(`duplicate ${label} ${k}: ${group.map(at).join(', ')}`)
  }
}

function checkWord({ word, at }: Entry, errors: string[], warnings: string[]): void {
  const id = wordId(word)
  const primaries = word.senses.filter((sense) => sense.primary).length
  if (primaries !== 1) {
    errors.push(`${id} (${at}): expected exactly one primary sense, found ${primaries}`)
  }

  for (const profile of PROFILES) {
    const min = earliest(word.senses.map((sense) => sense.introduced_at[profile]))
    if (word.introduced_at[profile] !== min) {
      errors.push(
        `${id} (${at}): introduced_at.${profile} is ${word.introduced_at[profile]}, but its earliest sense is ${min}`,
      )
    }
  }

  // Soft check: a sense_id is "<lemma>:<slug>"; reflexive lemmas drop their "się".
  const base = word.lemma.replace(/ się$/, '')
  for (const { sense_id } of word.senses) {
    if (!sense_id.startsWith(`${word.lemma}:`) && !sense_id.startsWith(`${base}:`)) {
      warnings.push(`${id} (${at}): sense_id ${sense_id} does not start with "${base}:"`)
    }
  }
}

export function assemble(chunks: ChunkInput[], fixups: Fixups): AssembleResult {
  const errors: string[] = []
  const warnings: string[] = []

  const entries = readChunks(chunks, errors)

  reportDuplicates(
    'frequency.rank',
    entries,
    (e) => String(e.word.frequency.rank),
    (e) => e.at,
    errors,
  )

  const { kept, dropped } = dropWords(entries, fixups, errors)
  reportDuplicates(
    'wordId',
    kept,
    (e) => wordId(e.word),
    (e) => e.at,
    errors,
  )
  reportDuplicates(
    'sense_id',
    kept.flatMap((e) => e.word.senses.map((sense) => ({ id: sense.sense_id, at: e.at }))),
    (sense) => sense.id,
    (sense) => sense.at,
    errors,
  )
  for (const entry of kept) checkWord(entry, errors, warnings)

  const words = kept.map((e) => e.word).sort((a, b) => a.frequency.rank - b.frequency.rank)
  return { words, dropped, errors, warnings }
}

// ---------------------------------------------------------------------------
// Step 5: words.json
// ---------------------------------------------------------------------------

export function buildWordsJson(words: RawWordV2[], generatedAt: string): WordsJsonV2 {
  // Levels are counted by the primary sense, in the Russian-only profile.
  const levels: Record<string, number> = Object.fromEntries(LEVEL_VALUES.map((l) => [l, 0]))
  for (const word of words) {
    const primary = word.senses.find((sense) => sense.primary)
    if (primary) levels[primary.introduced_at.ru] = (levels[primary.introduced_at.ru] ?? 0) + 1
  }
  return {
    schema_version: 2,
    generated_at: generatedAt,
    source: SOURCE,
    counts: {
      total: words.length,
      senses: words.reduce((sum, word) => sum + word.senses.length, 0),
      ...levels,
    },
    words,
  }
}

// ---------------------------------------------------------------------------
// Step 6: word-id-renames.json
// ---------------------------------------------------------------------------

/**
 * Joins the previous and the new dictionary by `frequency.rank` (the only key that survived the
 * edit) and returns `old wordId -> new wordId` for every word whose id changed. A word dropped
 * by `dropWords` maps to its `mergeInto`.
 */
export function buildRenames(
  previous: PreviousWord[],
  result: Pick<AssembleResult, 'words' | 'dropped'>,
): { renames: Record<string, string>; errors: string[] } {
  const errors: string[] = []
  const targetByRank = new Map<number, string>()
  for (const word of result.words) targetByRank.set(word.frequency.rank, wordId(word))
  for (const { word, mergeInto } of result.dropped) targetByRank.set(word.frequency.rank, mergeInto)

  const renames: Record<string, string> = {}
  const ordered = [...previous].sort((a, b) => a.frequency.rank - b.frequency.rank)
  for (const old of ordered) {
    const target = targetByRank.get(old.frequency.rank)
    if (target === undefined) {
      errors.push(
        `previous ${wordId(old)} (rank ${old.frequency.rank}) has no counterpart in the new dictionary`,
      )
    } else if (target !== wordId(old)) {
      if (wordId(old) in renames) errors.push(`previous wordId ${wordId(old)} is not unique`)
      renames[wordId(old)] = target
    }
  }

  const newIds = new Set(result.words.map(wordId))
  for (const [from, to] of Object.entries(renames)) {
    if (newIds.has(from)) errors.push(`rename ${from} -> ${to}: ${from} is also a new wordId`)
    if (!newIds.has(to)) errors.push(`rename ${from} -> ${to}: ${to} is not a new wordId`)
  }
  return { renames, errors }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function printLimited(title: string, lines: string[], print: (line: string) => void): void {
  if (lines.length === 0) return
  print(`${title} (${lines.length}):`)
  for (const line of lines.slice(0, MAX_PRINTED_LINES)) print(`  - ${line}`)
  if (lines.length > MAX_PRINTED_LINES) print(`  ... and ${lines.length - MAX_PRINTED_LINES} more`)
}

function listChunkFiles(partsDir: string): string[] {
  return readdirSync(partsDir)
    .flatMap((name) => {
      const match = /^words_(\d+)\.json$/.exec(name)
      return match ? [{ name, n: Number(match[1]) }] : []
    })
    .sort((a, b) => a.n - b.n)
    .map((f) => f.name)
}

/**
 * The previous `words.json` as the rename map's source — only while it is still schema_version 1.
 * `null` when it is missing or already v2 (the map was generated on the first run and must stay).
 */
function readPreviousV1(wordsPath: string): { bytes: Buffer; words: PreviousWord[] } | null {
  if (!existsSync(wordsPath)) return null
  const bytes = readFileSync(wordsPath)
  const json: unknown = JSON.parse(bytes.toString('utf8'))
  if (!isRecord(json) || json.schema_version !== 1) return null
  return { bytes, words: PreviousWordsSchema.parse(json).words }
}

/** Assembles `<dataDir>/words.json` from the chunks. Returns the process exit code. */
export function run(dataDir: string): number {
  const partsDir = join(dataDir, 'words_parts', 'output')
  const wordsPath = join(dataDir, 'words.json')
  const renamesPath = join(dataDir, 'word-id-renames.json')

  const fixups = FixupsSchema.parse(
    JSON.parse(readFileSync(join(dataDir, 'words-fixups.json'), 'utf8')),
  )
  const files = listChunkFiles(partsDir)
  if (files.length === 0) {
    console.error(`No words_NNN.json chunks in ${partsDir}`)
    return 1
  }
  const chunks: ChunkInput[] = files.map((file) => ({
    file,
    data: JSON.parse(readFileSync(join(partsDir, file), 'utf8')),
  }))
  // Not the wall clock: contentVersion hashes this file, and a re-run must be byte-identical.
  const generatedAt = new Date(
    Math.max(...files.map((file) => statSync(join(partsDir, file)).mtimeMs)),
  ).toISOString()

  const result = assemble(chunks, fixups)
  printLimited('Warnings', result.warnings, console.warn)

  const previous = readPreviousV1(wordsPath)
  const renamed = previous ? buildRenames(previous.words, result) : null
  const errors = [...result.errors, ...(renamed?.errors ?? [])]
  if (errors.length > 0) {
    printLimited('Errors', errors, console.error)
    console.error('Nothing was written.')
    return 1
  }

  writeJson(wordsPath, buildWordsJson(result.words, generatedAt))
  console.log(`Assembled ${wordsPath}`)
  console.log(
    `  ${files.length} chunks -> ${result.words.length} words (dropped ${result.dropped.length})`,
  )

  if (previous && renamed) {
    // sha256(words.json ++ inflections.json), like build-content.ts — the contentVersion v1.
    const fromContent = createHash('sha256')
      .update(previous.bytes)
      .update(readFileSync(join(dataDir, 'inflections.json')))
      .digest('hex')
      .slice(0, 12)
    writeJson(renamesPath, { fromContent, renames: renamed.renames })
    console.log(`  ${Object.keys(renamed.renames).length} wordId renames -> ${renamesPath}`)
  } else {
    console.log('  words.json was already v2: word-id-renames.json left untouched')
  }
  return 0
}

if (import.meta.main) {
  process.exitCode = run(DATA_DIR)
}
