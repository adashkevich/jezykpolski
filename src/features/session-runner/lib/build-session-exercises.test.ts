/**
 * `build-session-exercises.ts` (`spec/tasks/13-session-runner.md` §1's "lazy" half) —
 * `LearnQueueItem` -> materialized `SkillDescriptor`/`SkillRecord` -> `ExerciseInstance`.
 *
 * Lives outside `src/db/**`, so DB lifecycle goes through `lifecycle.repository.ts` (same
 * convention as this directory's other integration tests), never `db/database.ts` directly.
 * Senses-shard fetches are stubbed with an intentionally *empty* shard — `generateExercise`
 * (task 09) tolerates an empty translation list for a `choice` exercise (it only needs
 * `WordIndexEntry.primaryRu`, already inlined in the index) fine, and this module's own job
 * (materializing the right skill, wiring the right descriptor) doesn't depend on real
 * translation data at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import * as skillsRepo from '@/db/repositories/skills.repository.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { LearnQueueItem } from '@/learning/session/session.types.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { generateExtraForWord, generateForSkill, materializeQueueItem } from './build-session-exercises.ts'
import { SessionContentCache } from './session-content-context.ts'

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: -1,
    ...overrides,
  }
}

function makeFetchMock(routes: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, json: async () => routes[key] } as Response
  })
}

beforeEach(async () => {
  await openDatabase()
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
  initIndexStore([
    entry({ lemma: 'dom', rank: 1, primaryRu: 'дом' }),
    entry({ lemma: 'kot', rank: 2, primaryRu: 'кот' }),
    entry({ lemma: 'pies', rank: 3, primaryRu: 'собака' }),
    entry({ lemma: 'stol', rank: 4, primaryRu: 'стол' }),
  ])
  vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await deleteDatabase()
  __resetIndexStoreForTest()
})

describe('materializeQueueItem', () => {
  it('a "new" item materializes ONLY vocab:pl-ru via ensureSkill (rule 4), and resolves its SkillDescriptor', async () => {
    const wordId = encodeWordId('dom', 'NOUN')
    const item: LearnQueueItem = {
      source: 'new',
      word: entry({ lemma: 'dom', rank: 1, primaryRu: 'дом' }),
      wordId,
    }
    const ensureSpy = vi.spyOn(skillsRepo, 'ensureSkill')
    const cache = new SessionContentCache()

    const { descriptor, skill } = await materializeQueueItem(item, cache)

    expect(descriptor.dimension).toBe('vocab:pl-ru')
    expect(descriptor.wordId).toBe(wordId)
    expect(skill.skillId).toBe(encodeSkillId(wordId, 'vocab:pl-ru'))
    expect(skill.state).toBe('new')
    expect(ensureSpy).toHaveBeenCalledTimes(1)
    expect(ensureSpy).toHaveBeenCalledWith(
      encodeSkillId(wordId, 'vocab:pl-ru'),
      wordId,
      'vocab',
      'vocab:pl-ru',
    )

    // End-to-end confirmation of rule 4: the only row actually persisted for this word is
    // vocab:pl-ru — vocab:ru-pl is never touched.
    const persisted = await skillsRepo.getSkillsForWord(wordId)
    expect(persisted.map((s) => s.dimension)).toEqual(['vocab:pl-ru'])
  })

  // Task 31 (`spec/tasks/31-practice-vocabulary-drills.md` §3) — the `newWordDimension`
  // parameter `useSessionBootstrap.ts`'s `{ kind: 'practice-extra', variant: 'vocab-spelling'
  // }` branch relies on to materialize a brand-new word's *production* skill on demand,
  // instead of the default `vocab:pl-ru`.
  it('a "new" item materializes vocab:ru-pl instead when newWordDimension asks for it', async () => {
    const wordId = encodeWordId('stol', 'NOUN')
    const item: LearnQueueItem = {
      source: 'new',
      word: entry({ lemma: 'stol', rank: 4, primaryRu: 'стол' }),
      wordId,
    }
    const ensureSpy = vi.spyOn(skillsRepo, 'ensureSkill')
    const cache = new SessionContentCache()

    const { descriptor, skill } = await materializeQueueItem(item, cache, 'vocab:ru-pl')

    expect(descriptor.dimension).toBe('vocab:ru-pl')
    expect(skill.skillId).toBe(encodeSkillId(wordId, 'vocab:ru-pl'))
    expect(ensureSpy).toHaveBeenCalledTimes(1)
    expect(ensureSpy).toHaveBeenCalledWith(
      encodeSkillId(wordId, 'vocab:ru-pl'),
      wordId,
      'vocab',
      'vocab:ru-pl',
    )

    const persisted = await skillsRepo.getSkillsForWord(wordId)
    expect(persisted.map((s) => s.dimension)).toEqual(['vocab:ru-pl'])
  })

  it('a "due" item resolves the SkillDescriptor for the already-existing SkillRecord, without calling ensureSkill', async () => {
    const wordId = encodeWordId('kot', 'NOUN')
    const skillId = encodeSkillId(wordId, 'vocab:pl-ru')
    const existing = await skillsRepo.ensureSkill(skillId, wordId, 'vocab', 'vocab:pl-ru')

    const ensureSpy = vi.spyOn(skillsRepo, 'ensureSkill')
    const cache = new SessionContentCache()
    const item: LearnQueueItem = { source: 'due', skill: existing }

    const { descriptor, skill } = await materializeQueueItem(item, cache)

    expect(descriptor.skillId).toBe(skillId)
    expect(descriptor.dimension).toBe('vocab:pl-ru')
    expect(skill).toBe(existing)
    expect(ensureSpy).not.toHaveBeenCalled()
  })
})

describe('generateForSkill', () => {
  it('builds a deterministic ExerciseInstance from (descriptor, skill, attempt)', async () => {
    const wordId = encodeWordId('pies', 'NOUN')
    const item: LearnQueueItem = {
      source: 'new',
      word: entry({ lemma: 'pies', rank: 3, primaryRu: 'собака' }),
      wordId,
    }
    const cache = new SessionContentCache()
    const { descriptor, skill } = await materializeQueueItem(item, cache)

    const first = generateForSkill(descriptor, skill, cache, 0)
    const again = generateForSkill(descriptor, skill, cache, 0)
    const retry = generateForSkill(descriptor, skill, cache, 1)

    expect(first.skillId).toBe(descriptor.skillId)
    // Brand-new skill -> picker.ts chooses 'choice' (recognition), per architecture.md §7.2.
    expect(first.exercise.type).toBe('choice')
    // Same (skill, srs, seed) -> byte-identical instance (task 09's determinism contract).
    expect(first).toEqual(again)
    // A different attempt -> a different seed -> a different instance id, at minimum.
    expect(retry.id).not.toBe(first.id)
  })
})

// Task 31 (`spec/tasks/31-practice-vocabulary-drills.md` §3) — the `{ kind: 'practice-extra'
// }` counterpart of `generateForSkill`: no dedicated builders any more, just the ordinary
// `generateExercise` call, with `vocab-choice`/`vocab-spelling` mapping onto whichever
// dimension the caller already materialized.
describe('generateExtraForWord', () => {
  it('vocab-choice over a vocab:pl-ru descriptor produces a "choice" exercise', async () => {
    const wordId = encodeWordId('dom', 'NOUN')
    const item: LearnQueueItem = {
      source: 'new',
      word: entry({ lemma: 'dom', rank: 1, primaryRu: 'дом' }),
      wordId,
    }
    const cache = new SessionContentCache()
    const { descriptor, skill } = await materializeQueueItem(item, cache, 'vocab:pl-ru')

    const instance = generateExtraForWord('vocab-choice', descriptor, skill, cache, 0)
    expect(instance.exercise.type).toBe('choice')
  })

  it('vocab-spelling over a vocab:ru-pl descriptor produces an "input" exercise', async () => {
    const wordId = encodeWordId('kot', 'NOUN')
    const item: LearnQueueItem = {
      source: 'new',
      word: entry({ lemma: 'kot', rank: 2, primaryRu: 'кот' }),
      wordId,
    }
    const cache = new SessionContentCache()
    const { descriptor, skill } = await materializeQueueItem(item, cache, 'vocab:ru-pl')

    const instance = generateExtraForWord('vocab-spelling', descriptor, skill, cache, 0)
    expect(instance.exercise.type).toBe('input')
  })

  it('throws when the variant and the materialized descriptor disagree (wiring bug guard)', async () => {
    const wordId = encodeWordId('dom', 'NOUN')
    const item: LearnQueueItem = {
      source: 'new',
      word: entry({ lemma: 'dom', rank: 1, primaryRu: 'дом' }),
      wordId,
    }
    const cache = new SessionContentCache()
    const { descriptor, skill } = await materializeQueueItem(item, cache, 'vocab:pl-ru')

    expect(() => generateExtraForWord('vocab-spelling', descriptor, skill, cache, 0)).toThrow()
  })
})
