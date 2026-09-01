/**
 * `WordId` / `SkillId` encoding (`spec/tasks/03-domain-model.md` step 1,
 * `spec/architecture.md` §5.1).
 *
 * `wordId = "<lemma>|<POS>"` is unique across the whole corpus (verified against the real
 * data: 0 duplicates among the 7998 words), so it doubles as a stable identifier without a
 * separate synthetic key. `skillId = "<wordId>::<dimension>"` uses `"::"` — a double colon
 * — specifically so it never collides with the single `"|"` inside `wordId` or the single
 * `":"` separators inside `dimension` itself (e.g. `"noun:sg:genitive"`).
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { PosValue } from '@/content/codec.ts'
import { POS_VALUES } from '@/content/codec.ts'
import type { Dimension } from './dimensions.ts'

/** `"<lemma>|<POS>"`, e.g. `"kobieta|NOUN"`. */
export type WordId = string

/** `"<wordId>::<dimension>"`, e.g. `"kobieta|NOUN::noun:sg:genitive"`. */
export type SkillId = string

const WORD_ID_SEPARATOR = '|'
const SKILL_ID_SEPARATOR = '::'

export function encodeWordId(lemma: string, pos: PosValue): WordId {
  if (lemma.length === 0) {
    throw new Error('encodeWordId: lemma must not be empty')
  }
  if (lemma.includes(WORD_ID_SEPARATOR)) {
    throw new Error(`encodeWordId: lemma must not contain "${WORD_ID_SEPARATOR}": ${lemma}`)
  }
  return `${lemma}${WORD_ID_SEPARATOR}${pos}`
}

export function decodeWordId(id: WordId): { lemma: string; pos: PosValue } {
  const separatorIndex = id.lastIndexOf(WORD_ID_SEPARATOR)
  if (separatorIndex === -1) {
    throw new Error(`decodeWordId: malformed wordId (missing "${WORD_ID_SEPARATOR}"): ${id}`)
  }
  const lemma = id.slice(0, separatorIndex)
  const posCandidate = id.slice(separatorIndex + WORD_ID_SEPARATOR.length)
  if (!(POS_VALUES as readonly string[]).includes(posCandidate)) {
    throw new Error(`decodeWordId: unknown pos "${posCandidate}" in wordId: ${id}`)
  }
  return { lemma, pos: posCandidate as PosValue }
}

export function encodeSkillId(wordId: WordId, dimension: Dimension): SkillId {
  return `${wordId}${SKILL_ID_SEPARATOR}${dimension}`
}

export function decodeSkillId(id: SkillId): { wordId: WordId; dimension: Dimension } {
  const separatorIndex = id.indexOf(SKILL_ID_SEPARATOR)
  if (separatorIndex === -1) {
    throw new Error(`decodeSkillId: malformed skillId (missing "${SKILL_ID_SEPARATOR}"): ${id}`)
  }
  const wordId = id.slice(0, separatorIndex)
  const dimension = id.slice(separatorIndex + SKILL_ID_SEPARATOR.length) as Dimension
  return { wordId, dimension }
}
