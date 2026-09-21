/**
 * The Learn-session runner (`spec/tasks/13-session-runner.md` §3, `spec/architecture.md`
 * §10's control-flow diagram):
 *
 * ```text
 * progress bar (i / N)
 *   -> render exercise by type (registry, exercise-registry.tsx)
 *   -> answer -> grade -> applyAnswer -> feedback   (../lib/answer-pipeline.ts#submitAnswer)
 *   -> "Далее" -> next exercise
 *   -> queue empty -> onFinished() (SessionPage navigates to /session/result)
 * ```
 *
 * Split into two components:
 *
 *  - `SessionRunner` (this file's export) owns session-*lifetime* state: the live queue
 *    (Zustand), the exit dialog, the "queue emptied -> completeSession" effect, and the
 *    cross-question `requeuedSkills`/`newSkillIds` bookkeeping the mistake-requeue mechanic
 *    and session summary need.
 *  - `ActiveQuestion` owns exactly one question's ephemeral state (`feedback`,
 *    `submitting`, and — the reason for the split — `questionShownAt`). It is remounted via
 *    `key={instance.id}` every time the current exercise changes, so `questionShownAt` can
 *    be a plain `useState(() => Date.now())` lazy initializer (the exact pattern
 *    `hooks/useDueCount.ts` already uses) instead of a `useEffect` that calls `Date.now()`
 *    and `setState` in its body — `react-hooks/purity` (an *error* in this repo's lint
 *    config, not the more common warn) forbids calling an impure function like `Date.now()`
 *    during render/an effect body reachable from render, and `react-hooks/set-state-in-effect`
 *    separately forbids a direct (non-callback) `setState` inside an effect body. A lazy
 *    `useState` initializer is the one place React explicitly sanctions running exactly
 *    once, impure or not, per mount — remounting per question turns "reset on every new
 *    question" into "run once per mount", which is exactly what that escape hatch is for.
 *
 * Rule 5 (write-before-feedback): `handleAnswer` `await`s `submitAnswer` — which itself
 * `await`s `applyAnswer` — before calling `setFeedback`, so the Dexie write is always
 * durable before the feedback banner (and thus the "answer" the user perceives) appears.
 *
 * Rule 4 (damping) + mistake requeue: a skill missed on its first attempt in this session
 * gets pushed back into the *live* queue a little later (`useSessionStore#appendToQueue`)
 * so the learner sees it again before the session ends — this is what makes the damping
 * rule (a repeat of the *same* skill must not re-apply SRS) observable in ordinary play, not
 * just a contrived "call applyAnswer twice" scenario. Capped at one requeue per skill
 * (`requeuedSkillsRef`) to avoid an infinite retry loop for a skill the learner keeps
 * missing.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { completeSession, deleteSession } from '@/db/repositories/sessions.repository.ts'
import {
  markWordProductionKnown,
  markWordTranslationKnown,
  wouldMarkKnownChange,
} from '@/db/repositories/swipe.repository.ts'
import type { Exercise, ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import type { GradeResult } from '@/learning/exercises/grade.ts'
import {
  isFlawlessAttempt,
  type TypedAttemptOutcome,
} from '@/learning/exercises/letter-attempt.ts'
import { VOCAB_STAGE_ORDER } from '@/learning/progress/stage.ts'
import { AGAIN, HARD } from '@/learning/srs/policy.ts'
import type { VocabDimension } from '@/learning/skills/dimensions.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import { encodeSkillId, type SkillId } from '@/learning/skills/skill-id.ts'
import type { SessionMode } from '@/types/progress.ts'
import { isFirstAnswerInSession, useSessionStore } from '@/stores/session.store.ts'
import type { SessionRuntime } from '../hooks/useSessionBootstrap.ts'
import { correctAnswerOf, submitAnswer, toSrsState } from '../lib/answer-pipeline.ts'
import { generateForSkill } from '../lib/build-session-exercises.ts'
import { createExerciseComponentRegistry } from './exercise-registry.tsx'
import { ExerciseFeedback } from './ExerciseFeedback.tsx'
import { ExitSessionDialog } from './ExitSessionDialog.tsx'
import { SessionMatchingBlock } from './SessionMatchingBlock.tsx'
import { SessionProgressBar } from './SessionProgressBar.tsx'

export interface SessionRunnerProps {
  readonly runtime: SessionRuntime
  /**
   * Queue emptied (or "Выйти" confirmed) and the session row already written (either
   * `completeSession`, or -- task 14 acceptance point 8 -- `deleteSession` for a
   * zero-answer run, see `finalizeSession` below). `totalCount` lets `SessionPage` tell the
   * two cases apart: `0` means "don't show /session/result at all, go home" (task text §4).
   */
  onFinished(sessionId: number, totalCount: number): void
}

function summarizeSession(newSkillIds: ReadonlySet<SkillId>) {
  const state = useSessionStore.getState()
  let correctCount = 0
  for (const rating of state.firstAnswerBySkill.values()) {
    if (rating !== AGAIN) correctCount++
  }
  const totalCount = state.firstAnswerBySkill.size
  const newSkillCount = newSkillIds.size
  return { totalCount, correctCount, newSkillCount, reviewedSkillCount: totalCount - newSkillCount }
}

export function SessionRunner({ runtime, onFinished }: SessionRunnerProps) {
  const queue = useSessionStore((s) => s.queue)
  const currentIndex = useSessionStore((s) => s.currentIndex)
  const mode = useSessionStore((s) => s.mode)

  const [exitDialogOpen, setExitDialogOpen] = useState(false)
  const requeuedSkillsRef = useRef(new Set<SkillId>())
  const newSkillIdsRef = useRef(new Set<SkillId>())
  const finishedRef = useRef(false)

  const currentInstance = queue[currentIndex]

  /**
   * Writes the session row exactly once, however the session ends (queue emptied, or
   * "Выйти" confirmed) -- returns the summary so the caller can decide whether/how to
   * hand off. Task 14 acceptance point 8: a session that never received a single graded
   * answer must not leave a garbage row in `sessions` -- `deleteSession` removes it
   * outright instead of `completeSession` writing a zeroed, permanently-"complete" row that
   * would otherwise sit there forever with nothing to show on `/session/result`. The
   * returned `totalCount === 0` is exactly `SessionPage`'s "go home instead" signal.
   */
  async function writeSessionRecord() {
    const summary = summarizeSession(newSkillIdsRef.current)
    if (summary.totalCount === 0) {
      await deleteSession(runtime.sessionId)
    } else {
      await completeSession(runtime.sessionId, Date.now(), summary)
    }
    return summary
  }

  // Queue exhausted -> close out the session exactly once, then hand off to the caller.
  useEffect(() => {
    if (finishedRef.current || queue.length === 0 || currentIndex < queue.length) return
    finishedRef.current = true
    let cancelled = false
    ;(async () => {
      const summary = await writeSessionRecord()
      if (cancelled) return
      useSessionStore.getState().reset()
      onFinished(runtime.sessionId, summary.totalCount)
    })()
    return () => {
      cancelled = true
    }
    // `writeSessionRecord` is intentionally omitted: it's a plain closure recreated every
    // render (reading `newSkillIdsRef`/`runtime`, both already stable or already listed),
    // not a value whose *identity* changing should ever re-run this effect — `finishedRef`
    // is the real guard against a second run, same pattern `useSessionBootstrap.ts`'s own
    // mount effect already uses for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, queue.length, runtime, onFinished])

  async function handleExitConfirmed() {
    setExitDialogOpen(false)
    const summary = await writeSessionRecord()
    useSessionStore.getState().reset()
    onFinished(runtime.sessionId, summary.totalCount)
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SessionProgressBar
        current={currentIndex}
        total={queue.length}
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mr-2 shrink-0"
            onClick={() => setExitDialogOpen(true)}
            aria-label="Выйти из сессии"
          >
            <LogOut aria-hidden="true" className="size-5" />
          </Button>
        }
      />

      {currentInstance ? (
        // Task 40 §4 — the in-session "Сопоставление" block is a whole multi-pair screen with
        // no single "the" answer, so it bypasses `ActiveQuestion`/`exercise-registry.tsx`'s
        // per-type dispatch entirely (same reasoning as the Practice-only `table` type — see
        // that registry's own header) rather than trying to fit `ExerciseProps<E>`.
        currentInstance.exercise.type === 'matching' ? (
          <SessionMatchingBlock
            key={currentInstance.id}
            instance={currentInstance}
            sessionId={runtime.sessionId}
            newSkillIdsRef={newSkillIdsRef}
          />
        ) : (
          <ActiveQuestion
            key={currentInstance.id}
            instance={currentInstance}
            runtime={runtime}
            mode={mode}
            requeuedSkillsRef={requeuedSkillsRef}
            newSkillIdsRef={newSkillIdsRef}
          />
        )
      ) : (
        // Either mid-finish (the effect above is closing the session out) or a genuinely
        // empty queue slipped through — `SessionPage` never renders `SessionRunner` for an
        // empty `QueuePlan`, so this is just the one-tick gap while `completeSession` runs.
        <p
          role="status"
          aria-live="polite"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          Завершаем сессию…
        </p>
      )}

      <ExitSessionDialog
        open={exitDialogOpen}
        onOpenChange={setExitDialogOpen}
        onConfirm={() => {
          void handleExitConfirmed()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActiveQuestion — one question's lifetime. Remounted (via the parent's `key`) whenever the
// current `ExerciseInstance` changes; see this file's header for why that's load-bearing.
// ---------------------------------------------------------------------------

interface ActiveQuestionProps {
  readonly instance: ExerciseInstance
  readonly runtime: SessionRuntime
  readonly mode: SessionMode
  readonly requeuedSkillsRef: RefObject<Set<SkillId>>
  readonly newSkillIdsRef: RefObject<Set<SkillId>>
}

function ActiveQuestion({
  instance,
  runtime,
  mode,
  requeuedSkillsRef,
  newSkillIdsRef,
}: ActiveQuestionProps) {
  const [feedback, setFeedback] = useState<GradeResult | null>(null)
  // The outcome of a letter-by-letter attempt (task 29), kept only so the feedback panel can
  // show the "assisted" status (mistakes/hints used) — `null` for every non-typed exercise
  // and reset per question same as `feedback`.
  const [typedAttempt, setTypedAttempt] = useState<TypedAttemptOutcome | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Whether this question's feedback offers "Знаю" — decided once, right after the answer is
  // written (see `handleAnswer`).
  const [markKnownOffered, setMarkKnownOffered] = useState(false)
  // Lazy initializer -> runs exactly once, at this component's mount — see file header.
  const [questionShownAt] = useState(() => Date.now())

  const skillId = instance.skillId as SkillId
  const maybeDescriptor = runtime.descriptors.get(skillId)
  if (!maybeDescriptor) {
    throw new Error(`SessionRunner: no SkillDescriptor cached for "${skillId}"`)
  }
  // Re-bound to a fresh `const` so its narrowed (non-undefined) type survives into the
  // `handleAnswer` closure below — TS narrowing doesn't cross function-declaration
  // boundaries for a captured variable, only same-scope reads.
  const descriptor: SkillDescriptor = maybeDescriptor
  const srsSnapshot = runtime.skillByInstanceId.get(instance.id)

  const registry = useMemo(
    () =>
      createExerciseComponentRegistry({
        srsState: srsSnapshot ? toSrsState(srsSnapshot) : toSrsState(EMPTY_SKILL),
        now: questionShownAt,
      }),
    [srsSnapshot, questionShownAt],
  )

  // See `SessionRunner.tsx`'s own `ExerciseComponent` comment above (the sibling copy this
  // was factored out of) for why the flattened signature/cast is needed here.
  const ExerciseComponent = registry[instance.exercise.type] as
    | ComponentType<{
        exercise: Exercise
        onAnswer(answer: string, attempt?: TypedAttemptOutcome): void
        feedback: GradeResult | null
        disabled: boolean
      }>
    | undefined

  async function handleAnswer(answer: string, attempt?: TypedAttemptOutcome) {
    if (submitting || feedback !== null) return
    setSubmitting(true)
    const now = Date.now()
    const firstAnswer = isFirstAnswerInSession(useSessionStore.getState(), skillId)

    try {
      const result = await submitAnswer({
        sessionId: runtime.sessionId,
        mode,
        exercise: instance.exercise,
        skillId,
        wordId: descriptor.wordId,
        kind: descriptor.kind,
        answerGiven: answer,
        isFirstAnswerInSession: firstAnswer,
        elapsedMs: now - questionShownAt,
        now,
        attempt,
      })

      useSessionStore.getState().recordAnswer(instance, {
        skillId,
        answerGiven: answer,
        correct: result.gradeResult.correct,
        rating: result.rating,
        elapsedMs: now - questionShownAt,
      })

      if (result.isNewSkill) newSkillIdsRef.current.add(skillId)

      // Task 29: a word finished with a mistake or a hint (rating capped at Hard, see
      // `policy.ts#mapResultToRating`) requeues within the session exactly like a plain
      // wrong answer — `!correct` alone would miss it, since `grade()` still reports
      // `correct: true` for an assisted-but-completed attempt (§3 of the task spec).
      if (result.rating <= HARD && firstAnswer && !requeuedSkillsRef.current.has(skillId)) {
        requeuedSkillsRef.current.add(skillId)
        const freshSkill = await getSkill(skillId)
        if (freshSkill) {
          const nextAttempt = (runtime.attemptBySkillId.get(skillId) ?? 0) + 1
          runtime.attemptBySkillId.set(skillId, nextAttempt)
          const retryInstance = generateForSkill(
            descriptor,
            freshSkill,
            runtime.cache,
            nextAttempt,
            runtime.hintMode,
            runtime.forceCategory,
          )
          runtime.skillByInstanceId.set(retryInstance.id, freshSkill)
          useSessionStore.getState().appendToQueue(retryInstance)
        }
      }

      // «Знаю» (задача 41 §1) — на любом из трёх этапов перевода, уже после первого верного
      // ответа, и только когда нажатие что-то изменит. Читается после `submitAnswer`, так что
      // SRS-обновление самого этого ответа уже учтено. Условия идут от дешёвого к дорогому:
      // чтение БД (`wouldMarkKnownChange`) — последним.
      setMarkKnownOffered(
        isCleanAnswer(result.gradeResult, attempt) &&
          isVocabStage(descriptor.dimension) &&
          (await wouldMarkKnownChange(descriptor.wordId, descriptor.dimension)),
      )
      setTypedAttempt(attempt ?? null)
      setFeedback(result.gradeResult)
    } finally {
      setSubmitting(false)
    }
  }

  function handleNext() {
    useSessionStore.getState().advance()
  }

  const canMarkKnown = feedback !== null && markKnownOffered

  // «Знаю» после чистого ответа (задача 41 §2, на этапах выбора — задача 40 §3): сам ответ уже
  // оценён и записан `handleAnswer` — кнопка лишь дополнительно помечает слово известным
  // (самооценка, без отдельного reviewLog — то же рассуждение, что в шапке
  // `swipe.repository.ts`) и идёт дальше. На этапах выбора она ставит `review` обоим этапам
  // выбора И открывает `vocab:ru-pl-input` (`due: now`, так что раньше следующей сессии он не
  // появится — очередь уже построена, вопрос на ввод сюда не добавляется, FR-81). На вводе
  // она ставит `review` всем трём этапам. Оставшиеся вопросы по трём vocab-навыкам слова в
  // этой сессии отбрасываются.
  async function handleMarkKnown() {
    if (submitting || !canMarkKnown) return
    setSubmitting(true)
    try {
      if (descriptor.dimension === 'vocab:ru-pl-input') {
        await markWordProductionKnown(descriptor.wordId)
      } else {
        await markWordTranslationKnown(descriptor.wordId)
      }
      const store = useSessionStore.getState()
      store.dropUpcoming(new Set(VOCAB_STAGE_ORDER.map((d) => encodeSkillId(descriptor.wordId, d))))
      store.advance()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {ExerciseComponent ? (
        <ExerciseComponent
          exercise={instance.exercise}
          onAnswer={handleAnswer}
          feedback={feedback}
          disabled={submitting}
        />
      ) : (
        // Defensive fallback (exercise-registry.tsx's header): no component registered yet
        // for this type (only reachable once a later task's morphological skills start
        // getting ensureSkill'd into `skills` — see that file's header) — skip rather than
        // crash the whole session.
        <SkippedExerciseNotice exerciseType={instance.exercise.type} onSkip={handleNext} />
      )}

      {feedback && (
        <ExerciseFeedback
          feedback={feedback}
          correctAnswer={correctAnswerOf(instance.exercise)}
          attempt={typedAttempt ?? undefined}
          onNext={handleNext}
          onMarkKnown={
            canMarkKnown
              ? () => {
                  void handleMarkKnown()
                }
              : undefined
          }
        />
      )}
    </>
  )
}

const VOCAB_STAGES: ReadonlySet<SkillDescriptor['dimension']> = new Set(VOCAB_STAGE_ORDER)

/** Навык — один из трёх этапов перевода, на каждом из которых есть «Знаю» (задача 41 §1);
 *  морфологические навыки кнопки не предлагают. */
function isVocabStage(dimension: SkillDescriptor['dimension']): dimension is VocabDimension {
  return VOCAB_STAGES.has(dimension)
}

/**
 * Ответ «чистый» — такой, после которого «Знаю» не противоречит панели фидбэка (задача 41
 * §1): верный, а для побуквенного ввода ещё и безупречный (`isFlawlessAttempt`: ноль ошибок,
 * ноль подсказок, без «глазка»). После «верно, но с исправлением/подсказкой» панель говорит
 * «Слово вернётся на повторение», и «Знаю» рядом с этим было бы противоречием. Ответы без
 * `attempt` (выбор из вариантов) чисты по построению — то же правило, по которому
 * `ExerciseFeedback` называет их «Верно!».
 */
function isCleanAnswer(result: GradeResult, attempt: TypedAttemptOutcome | undefined): boolean {
  return result.correct && (attempt === undefined || isFlawlessAttempt(attempt))
}

/** A zeroed-out placeholder `SkillRecord` — only its FSRS-facing fields are read (via
 *  `toSrsState`) when a `self-assess` question happens to render before its own snapshot is
 *  available (never in practice today — see `exercise-registry.tsx`'s header on why
 *  `self-assess` isn't reachable via the default picker options — kept only so the registry
 *  factory always has a well-typed `SrsState` to pass, without an `undefined` special case). */
const EMPTY_SKILL = {
  skillId: '',
  wordId: '',
  kind: 'vocab',
  dimension: 'vocab:pl-ru',
  state: 'new',
  stability: 0,
  difficulty: 0,
  due: 0,
  reps: 0,
  lapses: 0,
  correct: 0,
  incorrect: 0,
  createdAt: 0,
  updatedAt: 0,
} as const

function SkippedExerciseNotice({
  exerciseType,
  onSkip,
}: {
  exerciseType: string
  onSkip: () => void
}) {
  useEffect(() => {
    console.warn(
      `SessionRunner: no component registered for exercise type "${exerciseType}" — skipping.`,
    )
  }, [exerciseType])
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      <p>Этот тип задания пока не поддерживается интерфейсом. Пропускаем.</p>
      <Button type="button" onClick={onSkip} className="min-h-11 self-start">
        Далее
      </Button>
    </div>
  )
}
