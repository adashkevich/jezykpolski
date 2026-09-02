/**
 * Active-session state (`spec/tasks/13-session-runner.md` §2, `spec/architecture.md` §10 —
 * the `SessionState` shape is copied field-for-field from that section).
 *
 * Deliberately NOT wrapped in `zustand/middleware/persist` (unlike `stores/filters.store.ts`)
 * — architecture.md §10 and the task text are explicit: "Zustand хранит только то, что нужно
 * для отрисовки текущего экрана" / "не буфер для отложенной записи". Every graded answer is
 * durably written to Dexie the instant it's graded (`features/session-runner/lib/answer-
 * pipeline.ts#submitAnswer`, called before this store's `recordAnswer`); this store only
 * exists so the current screen has something to render, and a page reload is expected to
 * lose it entirely — recovery after a reload works by re-reading `reviewLogs` for the
 * session's `id` (`db/repositories/sessions.repository.ts#getIncompleteSession`), not by
 * restoring this store.
 *
 * No orchestration logic lives here (no thunks that call `grade()`/`applyAnswer()`/etc.) —
 * that's `SessionRunner.tsx` / `answer-pipeline.ts`'s job. This store is intentionally dumb:
 * plain state plus the minimal setters the runner needs.
 */
import { create } from 'zustand'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import type { AnswerAttempt } from '@/learning/session/session.types.ts'
import type { SkillId } from '@/learning/skills/skill-id.ts'
import type { Rating, SessionMode } from '@/types/progress.ts'

export interface SessionState {
  sessionId: number | null
  mode: SessionMode
  queue: ExerciseInstance[]
  currentIndex: number
  answers: Map<string, AnswerAttempt>
  firstAnswerBySkill: Map<SkillId, Rating>
  mistakes: ExerciseInstance[]

  /** Starts a fresh (or resumed) session — replaces every field at once so the runner never
   *  has to worry about a stale `queue` from a previous session lingering. */
  startSession: (args: { sessionId: number; mode: SessionMode; queue: ExerciseInstance[] }) => void

  /** Appends an exercise to the *end* of the live queue — the mistake-requeue mechanic
   *  (task text §4): a skill missed on its first attempt gets one more, later, chance in the
   *  same session, which is exactly what makes the damping rule (§6.3) observable in normal
   *  play rather than only in a contrived "answer twice" test. */
  appendToQueue: (instance: ExerciseInstance) => void

  /** Records one graded attempt: always sets `answers`; sets `firstAnswerBySkill` only the
   *  first time this `skillId` is seen in the session (subsequent calls for the same skill
   *  are no-ops on that map — it exists precisely to remember the *first* rating); pushes
   *  `instance` onto `mistakes` when `attempt.correct` is false AND this was the skill's
   *  first attempt (a wrong *retry* of an already-mistaken skill doesn't need to be queued
   *  for "review mistakes" a second time). */
  recordAnswer: (instance: ExerciseInstance, attempt: AnswerAttempt) => void

  /** Resume-after-reload support (task text §5): pre-populates `firstAnswerBySkill` from
   *  this session's own `reviewLogs` (read by the caller via
   *  `reviews.repository.ts#getLogsForSession`) so the damping rule still holds for a skill
   *  that — despite the rebuilt queue already excluding every answered skill by construction
   *  — somehow reappears (e.g. a future scope change). A plain merge, not a replace: called
   *  right after `startSession`, before the first render. */
  seedFirstAnswers: (entries: ReadonlyMap<SkillId, Rating>) => void

  advance: () => void

  reset: () => void
}

const initialFields = {
  sessionId: null as number | null,
  mode: 'learn' as SessionMode,
  queue: [] as ExerciseInstance[],
  currentIndex: 0,
  answers: new Map<string, AnswerAttempt>(),
  firstAnswerBySkill: new Map<SkillId, Rating>(),
  mistakes: [] as ExerciseInstance[],
}

export const useSessionStore = create<SessionState>()((set) => ({
  ...initialFields,

  startSession: ({ sessionId, mode, queue }) =>
    set({
      sessionId,
      mode,
      queue,
      currentIndex: 0,
      answers: new Map(),
      firstAnswerBySkill: new Map(),
      mistakes: [],
    }),

  appendToQueue: (instance) => set((state) => ({ queue: [...state.queue, instance] })),

  recordAnswer: (instance, attempt) =>
    set((state) => {
      const isFirstAnswerInSession = !state.firstAnswerBySkill.has(attempt.skillId)
      const answers = new Map(state.answers)
      answers.set(instance.id, attempt)

      const firstAnswerBySkill = isFirstAnswerInSession
        ? new Map(state.firstAnswerBySkill).set(attempt.skillId, attempt.rating)
        : state.firstAnswerBySkill

      const mistakes =
        !attempt.correct && isFirstAnswerInSession ? [...state.mistakes, instance] : state.mistakes

      return { answers, firstAnswerBySkill, mistakes }
    }),

  seedFirstAnswers: (entries) =>
    set((state) => ({ firstAnswerBySkill: new Map([...state.firstAnswerBySkill, ...entries]) })),

  advance: () => set((state) => ({ currentIndex: state.currentIndex + 1 })),

  reset: () => set({ ...initialFields, answers: new Map(), firstAnswerBySkill: new Map() }),
}))

/** Whether `skillId` has not yet received any answer in the current session — the exact
 *  condition `learning/srs/policy.ts#shouldApplySrs` expects as its `isFirstAnswerInSession`
 *  argument. A plain function (not a hook) so `SessionRunner.tsx` can read it at answer-time
 *  via `useSessionStore.getState()` without subscribing the whole component to every
 *  `firstAnswerBySkill` change. */
export function isFirstAnswerInSession(state: SessionState, skillId: SkillId): boolean {
  return !state.firstAnswerBySkill.has(skillId)
}
