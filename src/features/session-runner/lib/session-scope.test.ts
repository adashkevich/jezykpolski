/**
 * `session-scope.ts` (`spec/tasks/13-session-runner.md`) — closing the router-state loop
 * from `LearnFab.tsx` (task 07, `{ filter }`) and `WordActions.tsx` (task 08, `{ wordId }`).
 *
 * Lives outside `src/db/**`, so DB lifecycle goes through
 * `lifecycle.repository.ts#openDatabase/deleteDatabase` (same convention as
 * `answer-pipeline.test.ts` / `DatabaseProvider.test.tsx`), never `db/database.ts` directly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { WordQuery } from '@/content/query.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { parseSessionScope, resolveSessionCandidates } from './session-scope.ts'

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: -1, // vocab-only fixtures — no paradigm fetch needed anywhere here.
    ...overrides,
  }
}

beforeEach(async () => {
  await openDatabase()
  __resetIndexStoreForTest()
})

afterEach(async () => {
  await deleteDatabase()
  __resetIndexStoreForTest()
})

// ---------------------------------------------------------------------------
// parseSessionScope — pure.
// ---------------------------------------------------------------------------

describe('parseSessionScope', () => {
  it('narrows { wordId } router state (WordActions.tsx) to the word scope', () => {
    expect(parseSessionScope({ wordId: 'kobieta|NOUN' })).toEqual({
      kind: 'word',
      wordId: 'kobieta|NOUN',
    })
  })

  it('narrows { filter } router state (LearnFab.tsx) to the filter scope', () => {
    const filter: WordQuery = { pos: ['NOUN'], sort: 'frequency' }
    expect(parseSessionScope({ filter })).toEqual({ kind: 'filter', filter })
  })

  it('narrows { skillIds } router state (SessionResultPage.tsx "Разобрать ошибки", task 14) to the mistake scope', () => {
    const skillIds = ['dom|NOUN::noun:sg:genitive', 'robic|VERB::verb:present:1:sg']
    expect(parseSessionScope({ skillIds })).toEqual({ kind: 'mistake', skillIds })
  })

  it('{ skillIds } takes priority over wordId/filter if a caller somehow sent both', () => {
    expect(parseSessionScope({ skillIds: ['a|NOUN::vocab:pl-ru'], wordId: 'b|NOUN' })).toEqual({
      kind: 'mistake',
      skillIds: ['a|NOUN::vocab:pl-ru'],
    })
  })

  it('falls back to global for null/undefined/empty/unrecognized state', () => {
    expect(parseSessionScope(null)).toEqual({ kind: 'global' })
    expect(parseSessionScope(undefined)).toEqual({ kind: 'global' })
    expect(parseSessionScope({})).toEqual({ kind: 'global' })
    expect(parseSessionScope({ somethingElse: 42 })).toEqual({ kind: 'global' })
  })
})

// ---------------------------------------------------------------------------
// resolveSessionCandidates — global scope.
// ---------------------------------------------------------------------------

describe('resolveGlobalScope (kind: global)', () => {
  it('mixes every overdue skill with every not-yet-started word, under the default target/budget', async () => {
    initIndexStore([
      entry({ lemma: 'znany', pos: 'ADJ', rank: 5, primaryRu: 'известный' }),
      entry({ lemma: 'nowy', pos: 'ADJ', rank: 6, primaryRu: 'новый' }),
    ])
    const knownWordId = encodeWordId('znany', 'ADJ')
    await ensureSkill(encodeSkillId(knownWordId, 'vocab:pl-ru'), knownWordId, 'vocab', 'vocab:pl-ru')
    // Without this, `znany` would ALSO show up as a "new" word candidate (no `wordProgress`
    // row yet -> `queryWords`'s status filter defaults an unknown word to 'new') — recomputing
    // it is what actually marks it "no longer new" for the `candidateNewWords` query below.
    await recomputeWordProgress(knownWordId)

    const now = Date.now() + 60_000 // safely past ensureSkill's `due: <creation time>`
    const candidates = await resolveSessionCandidates({ kind: 'global' }, now)

    expect(candidates.targetSize).toBe(20) // FR-133 default
    expect(candidates.newWordsBudget).toBe(10) // FR-133 default
    expect(candidates.dueSkills.map((s) => s.wordId)).toEqual([knownWordId])
    expect(candidates.candidateNewWords.map((w) => w.lemma)).toEqual(['nowy'])
  })

  it('honors settings overrides for targetSize/newWordsBudget (FR-133)', async () => {
    await settingsRepo.set('sessionTargetSize', 5)
    await settingsRepo.set('dailyNewWordsBudget', 2)
    initIndexStore([entry({ lemma: 'dom', rank: 1 })])

    const candidates = await resolveSessionCandidates({ kind: 'global' }, Date.now())
    expect(candidates.targetSize).toBe(5)
    expect(candidates.newWordsBudget).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// resolveSessionCandidates — filter scope (LearnFab).
// ---------------------------------------------------------------------------

describe('resolveFilterScope (kind: filter)', () => {
  it('narrows BOTH due skills and new-word candidates to words the filter matches', async () => {
    initIndexStore([
      entry({ lemma: 'stol', pos: 'NOUN', rank: 1, primaryRu: 'стол' }), // matches, due
      entry({ lemma: 'biegac', pos: 'VERB', rank: 2, primaryRu: 'бегать' }), // excluded, due
      entry({ lemma: 'krzeslo', pos: 'NOUN', rank: 3, primaryRu: 'стул' }), // matches, new
      entry({ lemma: 'jesc', pos: 'VERB', rank: 4, primaryRu: 'есть' }), // excluded, new
    ])
    const stolId = encodeWordId('stol', 'NOUN')
    const biegacId = encodeWordId('biegac', 'VERB')
    await ensureSkill(encodeSkillId(stolId, 'vocab:pl-ru'), stolId, 'vocab', 'vocab:pl-ru')
    await recomputeWordProgress(stolId)
    await ensureSkill(encodeSkillId(biegacId, 'vocab:pl-ru'), biegacId, 'vocab', 'vocab:pl-ru')
    await recomputeWordProgress(biegacId)

    const now = Date.now() + 60_000
    const filter: WordQuery = { pos: ['NOUN'], sort: 'frequency' }
    const candidates = await resolveSessionCandidates({ kind: 'filter', filter }, now)

    expect(candidates.dueSkills.map((s) => s.wordId)).toEqual([stolId])
    expect(candidates.candidateNewWords.map((w) => w.lemma)).toEqual(['krzeslo'])
  })

  it('an empty-matching filter yields an empty candidate pool on both sides', async () => {
    initIndexStore([entry({ lemma: 'dom', pos: 'NOUN', rank: 1 })])
    const filter: WordQuery = { pos: ['VERB'], sort: 'frequency' } // no VERB in the index
    const candidates = await resolveSessionCandidates({ kind: 'filter', filter }, Date.now())
    expect(candidates.dueSkills).toEqual([])
    expect(candidates.candidateNewWords).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveSessionCandidates — word scope (WordActions).
// ---------------------------------------------------------------------------

describe('resolveWordScope (kind: word)', () => {
  it('a genuinely new word (no skills at all) -> one new-word candidate, zero due skills', async () => {
    initIndexStore([entry({ lemma: 'czlowiek', pos: 'NOUN', rank: 1, primaryRu: 'человек' })])
    const wordId = encodeWordId('czlowiek', 'NOUN')

    const candidates = await resolveSessionCandidates({ kind: 'word', wordId }, Date.now())

    expect(candidates.dueSkills).toEqual([])
    expect(candidates.candidateNewWords).toHaveLength(1)
    expect(candidates.candidateNewWords[0]!.lemma).toBe('czlowiek')
    expect(candidates.newWordsBudget).toBe(1)
    expect(candidates.targetSize).toBe(1)
  })

  it('a word with an overdue skill -> that skill only, no new-word candidate (rule 4: no forced vocab:ru-pl either)', async () => {
    initIndexStore([entry({ lemma: 'dom', pos: 'NOUN', rank: 1 })])
    const wordId = encodeWordId('dom', 'NOUN')
    const skillId = encodeSkillId(wordId, 'vocab:pl-ru')
    await ensureSkill(skillId, wordId, 'vocab', 'vocab:pl-ru')

    const now = Date.now() + 60_000 // past the skill's creation-time `due`
    const candidates = await resolveSessionCandidates({ kind: 'word', wordId }, now)

    expect(candidates.dueSkills.map((s) => s.skillId)).toEqual([skillId])
    expect(candidates.candidateNewWords).toEqual([])
    expect(candidates.newWordsBudget).toBe(0)
  })

  it('a word with a skill that is not due yet -> completely empty (no forced review just because the user clicked "Учить")', async () => {
    initIndexStore([entry({ lemma: 'okno', pos: 'NOUN', rank: 1 })])
    const wordId = encodeWordId('okno', 'NOUN')
    await ensureSkill(encodeSkillId(wordId, 'vocab:pl-ru'), wordId, 'vocab', 'vocab:pl-ru')

    const past = Date.now() - 60_000 // before the skill's creation-time `due` -> not due yet
    const candidates = await resolveSessionCandidates({ kind: 'word', wordId }, past)

    expect(candidates.dueSkills).toEqual([])
    expect(candidates.candidateNewWords).toEqual([])
  })

  it('throws for a wordId that is not in the content index at all', async () => {
    initIndexStore([])
    await expect(
      resolveSessionCandidates({ kind: 'word', wordId: 'nope|NOUN' }, Date.now()),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// resolveSessionCandidates — mistake scope (task 14, SessionResultPage "Разобрать ошибки").
// ---------------------------------------------------------------------------

describe('resolveMistakeScope (kind: mistake)', () => {
  it('returns exactly the listed skills as dueSkills, with no due-filtering and no new-word budget', async () => {
    initIndexStore([
      entry({ lemma: 'dom', pos: 'NOUN', rank: 1 }),
      entry({ lemma: 'kot', pos: 'NOUN', rank: 2 }),
    ])
    const domId = encodeWordId('dom', 'NOUN')
    const kotId = encodeWordId('kot', 'NOUN')
    const domSkill = encodeSkillId(domId, 'vocab:pl-ru')
    const kotSkill = encodeSkillId(kotId, 'vocab:pl-ru')
    await ensureSkill(domSkill, domId, 'vocab', 'vocab:pl-ru')
    await ensureSkill(kotSkill, kotId, 'vocab', 'vocab:pl-ru')

    // Deliberately called with `now` far BEFORE either skill's `due` — a due-filtered scope
    // (global/filter/word) would exclude both; the mistake scope must not.
    const past = Date.now() - 60_000
    const candidates = await resolveSessionCandidates(
      { kind: 'mistake', skillIds: [domSkill, kotSkill] },
      past,
    )

    expect(candidates.dueSkills.map((s) => s.skillId).sort()).toEqual([domSkill, kotSkill].sort())
    expect(candidates.candidateNewWords).toEqual([])
    expect(candidates.newWordsBudget).toBe(0)
    expect(candidates.targetSize).toBe(2)
  })

  it('drops a skillId that no longer resolves to a SkillRecord instead of throwing', async () => {
    initIndexStore([entry({ lemma: 'dom', pos: 'NOUN', rank: 1 })])
    const domId = encodeWordId('dom', 'NOUN')
    const domSkill = encodeSkillId(domId, 'vocab:pl-ru')
    await ensureSkill(domSkill, domId, 'vocab', 'vocab:pl-ru')

    const candidates = await resolveSessionCandidates(
      { kind: 'mistake', skillIds: [domSkill, 'nope|NOUN::vocab:pl-ru'] },
      Date.now(),
    )
    expect(candidates.dueSkills.map((s) => s.skillId)).toEqual([domSkill])
    expect(candidates.targetSize).toBe(1)
  })

  it('an empty skillIds list resolves to a fully empty candidate pool', async () => {
    const candidates = await resolveSessionCandidates({ kind: 'mistake', skillIds: [] }, Date.now())
    expect(candidates.dueSkills).toEqual([])
    expect(candidates.targetSize).toBe(0)
  })
})
