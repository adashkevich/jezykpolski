/**
 * Resolves what a Learn session's candidate pool should be, from the router-state payload
 * `LearnFab.tsx` (task 07) and `WordActions.tsx` (task 08) already send to `/session` — this
 * is the "close the loop" work both of those files' headers point at task 13 to finish.
 *
 * Three scopes, all still Learn mode (task text's explicit framing, `spec/app-design.md`
 * §24: a filtered/single-word Learn session is still the algorithm choosing what/when/which
 * exercise — Practice, task 19, is the *other* thing, where the user picks exact filters
 * like "plural instrumental B1 nouns" and gets weaker SRS credit for it):
 *
 *  - `{ wordId }` (`WordActions`'s "Учить") — only this word's own due skills, plus its
 *    `vocab:pl-ru` if it has no skills at all yet. Deliberately does NOT force an exercise
 *    when the word has skills but none are due right now (task text: "due-навыки этого слова
 *    + сам vocab:pl-ru, если слово новое" — a literal due/new-only scope, not "show this word
 *    regardless of schedule") — an already-scheduled, not-yet-due word yields an empty scope,
 *    which surfaces as `SessionPage`'s `EmptyState` (acceptance point 10).
 *  - `{ filter }` (`LearnFab`'s "Учить" on a filtered `/words` list) — both the due-skill
 *    pool and the new-word pool are narrowed to words the filter matches (task text says
 *    "и, по желанию, dueSkills" — optional for reviews; this resolves that "желание" as yes,
 *    for consistency: a session launched from a specific filter should feel scoped to it
 *    end to end, not just for the new words it introduces).
 *  - no state at all (future `HomePage`'s "Продолжить обучение", task 15; also today's
 *    fallback for direct `/session` navigation) — the global pool: every due skill, every
 *    not-yet-started word, ordered by rank.
 *
 * A fourth scope, added by task 14 (`spec/app-design.md` §22 "Режим «Ошибки»", FR-102):
 *
 *  - `{ skillIds }` (`SessionResultPage`'s "Разобрать ошибки") — an explicit, fixed list of
 *    skills that were answered wrong in the session just finished. Unlike the three scopes
 *    above, this is NOT a Learn queue in disguise: no due-filtering (every listed skill goes
 *    in regardless of its own `due` timestamp — the whole point is "review what you just
 *    missed *now*, not whenever SRS would have scheduled it"), and no new-word budget (a
 *    mistakes review only ever revisits skills that already exist). `useSessionBootstrap.ts`
 *    is what actually maps this scope to `mode: 'mistakes'` — this module only resolves the
 *    candidate pool, same as it does for the other three scopes; it has no opinion on mode.
 *
 * `targetSize`/`newWordsBudget` (FR-133) come from `settings.repository.ts` with the task
 * text's own stated defaults (20 / 10) as fallback — no settings screen writes these keys
 * yet (task 24), so every session runs at the default until one does; the word-scoped case
 * overrides both so the single word the user explicitly asked to practice is never silently
 * dropped by an unrelated daily-goal setting.
 */
import { getDueSkills, getSkill } from '@/db/repositories/skills.repository.ts'
import { getSkillsForWord } from '@/db/repositories/skills.repository.ts'
import { getAllWordProgress } from '@/db/repositories/words-progress.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { queryWords, type WordQuery } from '@/content/query.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { encodeWordId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'

export type SessionScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'word'; readonly wordId: WordId }
  | { readonly kind: 'filter'; readonly filter: WordQuery }
  | { readonly kind: 'mistake'; readonly skillIds: readonly SkillId[] }

const DEFAULT_TARGET_SIZE_KEY = 'sessionTargetSize'
const DEFAULT_NEW_WORDS_BUDGET_KEY = 'dailyNewWordsBudget'
const DEFAULT_TARGET_SIZE = 20
const DEFAULT_NEW_WORDS_BUDGET = 10

/** A very generous cap on how many overdue skills a single query pulls in — `buildLearnQueue`
 *  trims to `targetSize` anyway, this just bounds one Dexie read for a large backlog. */
const DUE_SKILLS_FETCH_LIMIT = 2000

/** Reads the raw `location.state` payload `LearnFab`/`WordActions`/`SessionResultPage`
 *  attach and narrows it to a `SessionScope` — anything else (including a plain reload with
 *  no state, or a future caller that passes nothing) falls back to `'global'`.
 *  `{ skillIds }` (task 14, `SessionResultPage`'s "Разобрать ошибки") is checked first: it's
 *  the most specific shape, and — unlike `wordId`/`filter` — always non-empty by the time
 *  the button that produces it is even shown (see that page's own guard). */
export function parseSessionScope(locationState: unknown): SessionScope {
  if (locationState && typeof locationState === 'object') {
    const state = locationState as Record<string, unknown>
    if (Array.isArray(state.skillIds)) {
      return { kind: 'mistake', skillIds: state.skillIds as SkillId[] }
    }
    if (typeof state.wordId === 'string') {
      return { kind: 'word', wordId: state.wordId }
    }
    if (state.filter && typeof state.filter === 'object') {
      return { kind: 'filter', filter: state.filter as WordQuery }
    }
  }
  return { kind: 'global' }
}

export interface SessionCandidates {
  readonly dueSkills: readonly SkillRecord[]
  readonly candidateNewWords: readonly WordIndexEntry[]
  readonly targetSize: number
  readonly newWordsBudget: number
}

async function resolveWordScope(wordId: WordId, now: number): Promise<SessionCandidates> {
  const entry = getIndexStore().byId.get(wordId)
  if (!entry) {
    throw new Error(`resolveSessionCandidates: unknown wordId "${wordId}"`)
  }
  const existingSkills = await getSkillsForWord(wordId)
  const dueSkills = existingSkills.filter((s) => s.due <= now)
  const candidateNewWords = existingSkills.length === 0 ? [entry] : []
  return {
    dueSkills,
    candidateNewWords,
    targetSize: Math.max(dueSkills.length + candidateNewWords.length, 1),
    newWordsBudget: candidateNewWords.length,
  }
}

async function resolveFilterScope(filter: WordQuery, now: number): Promise<SessionCandidates> {
  const [progress, targetSize, newWordsBudget] = await Promise.all([
    getAllWordProgress(),
    settingsRepo.get(DEFAULT_TARGET_SIZE_KEY, DEFAULT_TARGET_SIZE),
    settingsRepo.get(DEFAULT_NEW_WORDS_BUDGET_KEY, DEFAULT_NEW_WORDS_BUDGET),
  ])

  const matchingWords = queryWords(filter, progress)
  const matchingWordIds = new Set(matchingWords.map((w) => encodeWordId(w.lemma, w.pos)))

  const allDue = await getDueSkills(now, DUE_SKILLS_FETCH_LIMIT)
  const dueSkills = allDue.filter((s) => matchingWordIds.has(s.wordId))
  const candidateNewWords = queryWords({ ...filter, status: ['new'] }, progress)

  return { dueSkills, candidateNewWords, targetSize, newWordsBudget }
}

/**
 * Task 14's fourth scope — see this file's header. Fetches each listed skill's current
 * `SkillRecord` directly (`getSkill`, not `getDueSkills`): the whole point is bypassing
 * due-filtering entirely, so this never calls into `getDueSkills` at all. A `skillId` whose
 * `SkillRecord` has since vanished (defensive only — nothing in this app deletes skills
 * today) is silently dropped rather than throwing, matching `resolveWordScope`'s own "an
 * already-scheduled-but-not-due word yields an empty scope" spirit: a stale reference should
 * shrink the queue, not crash the whole session launch.
 */
async function resolveMistakeScope(skillIds: readonly SkillId[]): Promise<SessionCandidates> {
  const skills = await Promise.all(skillIds.map((skillId) => getSkill(skillId)))
  const dueSkills = skills.filter((s): s is SkillRecord => s !== undefined)
  return {
    dueSkills,
    candidateNewWords: [],
    targetSize: dueSkills.length,
    newWordsBudget: 0,
  }
}

async function resolveGlobalScope(now: number): Promise<SessionCandidates> {
  const [progress, targetSize, newWordsBudget, dueSkills] = await Promise.all([
    getAllWordProgress(),
    settingsRepo.get(DEFAULT_TARGET_SIZE_KEY, DEFAULT_TARGET_SIZE),
    settingsRepo.get(DEFAULT_NEW_WORDS_BUDGET_KEY, DEFAULT_NEW_WORDS_BUDGET),
    getDueSkills(now, DUE_SKILLS_FETCH_LIMIT),
  ])
  const candidateNewWords = queryWords({ sort: 'frequency', status: ['new'] }, progress)
  return { dueSkills, candidateNewWords, targetSize, newWordsBudget }
}

export function resolveSessionCandidates(
  scope: SessionScope,
  now: number,
): Promise<SessionCandidates> {
  switch (scope.kind) {
    case 'word':
      return resolveWordScope(scope.wordId, now)
    case 'filter':
      return resolveFilterScope(scope.filter, now)
    case 'global':
      return resolveGlobalScope(now)
    case 'mistake':
      return resolveMistakeScope(scope.skillIds)
  }
}
