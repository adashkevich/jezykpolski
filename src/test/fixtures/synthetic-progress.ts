/**
 * Shared synthetic-scale fixture generator — 20,000 `skills` rows / 50,000 `reviewLogs` rows
 * (`spec/tasks/26-quality-a11y-e2e.md` §3: "Сгенерировать синтетический прогресс (20 000
 * навыков, 50 000 логов) фикстурой").
 *
 * Pulled out as a standalone, reusable module rather than adding a third inline copy of the
 * same generation logic: `src/content/query.test.ts` (task 04) already builds its own ~8000-
 * entry synthetic `WordIndexEntry[]` for the `queryWords` perf budget, and
 * `src/db/repositories/stats.repository.test.ts` (task 23) already builds its own 20,000-row
 * synthetic `skills` set for the `/stats` perf budget — both scoped tightly to their own
 * task's one acceptance number and neither reusable as-is (task 04's fixture has no
 * `skills`/`reviewLogs` at all; task 23's has no `reviewLogs` and hard-codes an 8000-word
 * index inline). This module is the first shared one, built for this task's own "не только
 * /stats, но и общий смок" requirement (`src/db/synthetic-scale.smoke.test.ts` — lives under
 * `src/db/**`, not `src/test/**`, only because `eslint.config.js`'s `no-restricted-imports`
 * reserves the direct Dexie `db` import for that directory), and is
 * intentionally NOT wired back into task 04/23's existing, already-passing tests — refactoring
 * those is out of this task's scope (rule 1: "не переделывай функциональность"/existing
 * passing tests), this just stops a fourth copy from appearing.
 *
 * Every function here is pure (no Dexie, no fake-indexeddb import) — callers `bulkPut` the
 * returned arrays into whichever `PolishLearningDatabase` instance they're testing against.
 */
import { POS_VALUES, type CaseValue, type PosValue } from '@/content/codec.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { ReviewLogRecord, SkillRecord, WordProgressRecord } from '@/types/progress.ts'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
const CASES: readonly CaseValue[] = [
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'instrumental',
  'locative',
  'vocative',
]
const TENSES = ['present', 'past', 'future'] as const

/** `wordCount` synthetic `WordIndexEntry` rows spanning every POS/level, matching the real
 *  corpus's rough scale (`requirements.md` §5: 7998 words) closely enough for realistic
 *  filtering/sorting behavior — see `index-store.ts`'s `initIndexStore` for how a caller
 *  installs these. */
export function generateSyntheticIndexEntries(wordCount = 8000): WordIndexEntry[] {
  const entries: WordIndexEntry[] = []
  for (let i = 0; i < wordCount; i++) {
    entries.push({
      lemma: `synthword${i}`,
      pos: POS_VALUES[i % POS_VALUES.length]!,
      rank: i,
      level: LEVELS[i % LEVELS.length]!,
      primaryRu: `перевод ${i}`,
      sensesShard: i % 16,
      paradigmShard: -1, // no network fetch — see stats.repository.test.ts's own header
    })
  }
  return entries
}

/** One `wordProgress` row per index entry, statuses spread across the four buckets. */
export function generateSyntheticWordProgress(
  entries: readonly WordIndexEntry[],
  now = Date.now(),
): WordProgressRecord[] {
  const statuses = ['new', 'learning', 'known', 'mastered'] as const
  return entries.map((entry, i) => ({
    wordId: encodeWordId(entry.lemma, entry.pos),
    status: statuses[i % statuses.length]!,
    vocabMaturity: (i % 100) / 100,
    morphMaturity: (i % 73) / 100,
    updatedAt: now,
  }))
}

/**
 * `skillCount` synthetic `SkillRecord` rows, distributed across kinds in roughly the same
 * proportions `stats.repository.test.ts`'s own 20k fixture uses (vocab dominant; noun/verb/
 * adj/adv the lazily-materialized morphology skills) — realistic enough that `[kind+due]`/
 * `due` index queries exercise every branch a real account would.
 */
export function generateSyntheticSkills(
  entries: readonly WordIndexEntry[],
  skillCount = 20_000,
  now = Date.now(),
): SkillRecord[] {
  const byPos = new Map<PosValue, WordIndexEntry[]>()
  for (const entry of entries) {
    const list = byPos.get(entry.pos)
    if (list) list.push(entry)
    else byPos.set(entry.pos, [entry])
  }
  const nounWords = byPos.get('NOUN') ?? entries
  const verbWords = byPos.get('VERB') ?? entries
  const adjWords = byPos.get('ADJ') ?? entries
  const advWords = byPos.get('ADV') ?? entries
  const allWords = entries.length > 0 ? entries : [{ lemma: 'x', pos: 'NOUN' } as WordIndexEntry]

  const skills: SkillRecord[] = []
  const usedSkillIds = new Set<string>()
  function push(count: number, build: (i: number) => SkillRecord) {
    for (let i = 0; i < count; i++) skills.push(build(i))
  }

  const vocabCount = Math.round(skillCount * 0.4)
  const nounCount = Math.round(skillCount * 0.3)
  const verbCount = Math.round(skillCount * 0.2)
  const adjCount = Math.round(skillCount * 0.075)
  const advCount = skillCount - vocabCount - nounCount - verbCount - adjCount

  push(vocabCount, (i) => {
    const word = allWords[i % allWords.length]!
    const dimension = i % 2 === 0 ? 'vocab:pl-ru' : 'vocab:ru-pl'
    return skillFor(word, 'vocab', dimension, i, now, usedSkillIds)
  })
  push(nounCount, (i) => {
    const word = nounWords[i % nounWords.length]!
    const dimension = `noun:${i % 2 === 0 ? 'sg' : 'pl'}:${CASES[i % CASES.length]}`
    return skillFor(word, 'noun', dimension, i, now, usedSkillIds)
  })
  push(verbCount, (i) => {
    const word = verbWords[i % verbWords.length]!
    const dimension = `verb:${TENSES[i % TENSES.length]}:${(i % 3) + 1}:${i % 2 === 0 ? 'sg' : 'pl'}`
    return skillFor(word, 'verb', dimension, i, now, usedSkillIds)
  })
  push(adjCount, (i) => {
    const word = adjWords[i % adjWords.length]!
    return skillFor(word, 'adj', 'adj:degree:comparative', i, now, usedSkillIds)
  })
  push(advCount, (i) => {
    const word = advWords[i % advWords.length]!
    return skillFor(word, 'adv', 'adv:degree:comparative', i, now, usedSkillIds)
  })

  return skills
}

/**
 * Builds one `SkillRecord`, keeping `dimension` a realistic, correctly-shaped `Dimension`
 * string (never a synthetic suffix like `#i`) so downstream consumers that parse it
 * (`stats.repository.ts`'s tense/case extraction, `dimensions.ts`'s label lookups) see the
 * same shapes a real account would. `usedSkillIds` is a defensive net against the rare
 * modular-arithmetic case where the same `(word, dimension)` pair would otherwise repeat —
 * see this module's own analysis in git history / the task's decision log; verified by
 * construction not to fire for the default 20,000/8,000 ratios this file ships, but cheap
 * enough to keep for any caller that passes different counts.
 */
function skillFor(
  word: WordIndexEntry,
  kind: SkillRecord['kind'],
  dimension: string,
  i: number,
  now: number,
  usedSkillIds: Set<string>,
): SkillRecord {
  const wordId = encodeWordId(word.lemma, word.pos)
  let skillId = encodeSkillId(wordId, dimension as Dimension)
  let dedupeSuffix = 0
  while (usedSkillIds.has(skillId)) {
    dedupeSuffix++
    skillId = encodeSkillId(encodeWordId(`${word.lemma}-dup${dedupeSuffix}`, word.pos), dimension as Dimension)
  }
  usedSkillIds.add(skillId)
  return {
    skillId,
    wordId,
    kind,
    dimension,
    state: (['new', 'learning', 'review'] as const)[i % 3]!,
    stability: (i % 60) + 1,
    difficulty: 1 + (i % 9),
    due: now - (i % 30) * 86_400_000 + (i % 7) * 3_600_000,
    reps: i % 12,
    lapses: i % 4,
    correct: i % 20,
    incorrect: i % 5,
    createdAt: now - (i % 90) * 86_400_000,
    updatedAt: now - (i % 5) * 86_400_000,
  }
}

/**
 * `logCount` synthetic `reviewLogs` rows, referencing real `skillId`/`wordId`/`kind` triples
 * drawn from `skills` (cycling through them — 50,000 logs over 20,000 skills means every
 * skill gets ~2.5 log rows on average, close to a real account's repeat-review pattern)
 * rather than inventing unrelated ids, so a query that joins the two tables sees consistent
 * data.
 */
export function generateSyntheticReviewLogs(
  skills: readonly SkillRecord[],
  logCount = 50_000,
  now = Date.now(),
): ReviewLogRecord[] {
  if (skills.length === 0) return []
  const logs: ReviewLogRecord[] = []
  for (let i = 0; i < logCount; i++) {
    const skill = skills[i % skills.length]!
    const correct = i % 5 !== 0 // 80% correct, a plausible real accuracy rate
    logs.push({
      sessionId: Math.floor(i / 20) + 1,
      skillId: skill.skillId,
      wordId: skill.wordId,
      exerciseType: skill.kind === 'vocab' ? 'choice' : 'form-choice',
      reviewedAt: now - (logCount - i) * 60_000,
      rating: ((i % 4) + 1) as ReviewLogRecord['rating'],
      correct,
      answerGiven: correct ? 'ok' : 'blad',
      expected: 'ok',
      elapsedMs: 1500 + (i % 4000),
      srsApplied: i % 7 !== 0,
    })
  }
  return logs
}

export interface SyntheticFixture {
  readonly entries: WordIndexEntry[]
  readonly wordProgress: WordProgressRecord[]
  readonly skills: SkillRecord[]
  readonly reviewLogs: ReviewLogRecord[]
}

/** One-call convenience wrapper — the shape every caller of this module actually wants:
 *  "give me 20k skills / 50k logs and everything they reference". */
export function buildSyntheticFixture(
  options: {
    readonly wordCount?: number
    readonly skillCount?: number
    readonly logCount?: number
    readonly now?: number
  } = {},
): SyntheticFixture {
  const now = options.now ?? Date.now()
  const entries = generateSyntheticIndexEntries(options.wordCount ?? 8000)
  const wordProgress = generateSyntheticWordProgress(entries, now)
  const skills = generateSyntheticSkills(entries, options.skillCount ?? 20_000, now)
  const reviewLogs = generateSyntheticReviewLogs(skills, options.logCount ?? 50_000, now)
  return { entries, wordProgress, skills, reviewLogs }
}
