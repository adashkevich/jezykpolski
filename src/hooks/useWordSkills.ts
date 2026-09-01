/**
 * `useWordSkills` — live `SkillRecord[]` for one word (`spec/tasks/08-word-detail.md` §4).
 *
 * Sibling to `useWordProgress.ts`: that hook reads the denormalized `wordProgress` cache
 * (cheap, always up to date, exactly what the two top-level "Слово"/"Формы" bars need — see
 * `WordDetailPage`'s decision log entry on why the top bars read the cache instead of
 * recomputing). This hook reads the real per-skill rows instead, which is what the
 * per-dimension breakdown (FR-47, `learning/progress/aggregate.ts#aggregateByDimension`)
 * needs: the cache only stores two scalars, not a breakdown by case/tense/gender.
 *
 * Built on `useLiveQuery` for the same reason as `useWordProgress` (NFR-12) — in particular
 * so the breakdown (and, via `useWordProgress`, the top bars) both re-render on their own
 * once "Сбросить прогресс" deletes the word's skills, with no manual refetch wiring.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { getSkillsForWord } from '@/db/repositories/skills.repository.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord } from '@/types/progress.ts'

/** `undefined` while the first query is in flight; `[]` (not `undefined`) once it has
 *  resolved for a word with no materialized skills yet. */
export function useWordSkills(wordId: WordId): SkillRecord[] | undefined {
  return useLiveQuery(() => getSkillsForWord(wordId), [wordId])
}
