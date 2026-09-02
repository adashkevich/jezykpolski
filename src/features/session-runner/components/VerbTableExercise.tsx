/**
 * `table` exercise — ONE VERB tense/mood's person x number (x gender, for `past`) grid,
 * filled one cell at a time (`spec/tasks/21-verb-exercises.md` step 5, `spec/app-design.md`
 * §13's "Полная таблица" mockup). Sibling of `TableExercise.tsx` (NOUN's own table drill,
 * task 18) — same grading rhythm (grade on blur/Enter, `submitAnswer` with `mode: 'practice'`,
 * lazy `ensureSkill` materialization per cell) — but a flat vertical list of rows instead of
 * a case x number grid: a VERB table is 6 (or, for `past`, up to 15) independent
 * single-cell rows, not a 2-column grid, so there is no NOUN-shaped "sg column / pl column"
 * to reuse. Kept as its own component rather than folded into `TableExercise.tsx` — see
 * `../hooks/useVerbTablePracticeSession.ts`'s header for the parallel-vs-generalize
 * reasoning, which applies here too.
 *
 * Row labels come straight from `describeDimension` (`learning/skills/dimensions.ts`, this
 * task's own extension) — `primary.pl` is the pronoun ("ty", or, for `past`, the exact
 * gender-resolved one — "ona"), `secondary.pl` is only shown for `past` rows (the human
 * gender word, "kobieta") since present/future/imperative's `secondary` (the tense/mood
 * itself) is already redundant with this whole page being one tense/mood.
 */
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import { describeDimension } from '@/learning/skills/dimensions.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import { encodeSkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { Exercise, TableCell } from '@/learning/exercises/exercise.types.ts'
import { submitAnswer } from '../lib/answer-pipeline.ts'
import type { VerbTableExerciseData } from '../hooks/useVerbTablePracticeSession.ts'
import type { VerbTableTense } from '@/learning/exercises/generate.ts'

type CellStatus = 'idle' | 'grading' | 'correct' | 'nearMiss' | 'incorrect'

interface CellState {
  readonly value: string
  readonly status: CellStatus
}

const IDLE_STATE: CellState = { value: '', status: 'idle' }

function cellKey(cell: TableCell): string {
  return cell.slot
}

/** `primary` = pronoun, `secondary` (past only) = the human gender word — no `tertiary`
 *  (the tense label) since the page heading already names the tense once for the whole
 *  table. */
function rowLabel(cell: TableCell, tense: VerbTableTense): { readonly pl: string; readonly ru: string } {
  const dimension = describeDimension(cell.slot)
  if (tense !== 'past' || !dimension.secondary) return dimension.primary
  return {
    pl: `${dimension.primary.pl} (${dimension.secondary.pl})`,
    ru: `${dimension.primary.ru} (${dimension.secondary.ru})`,
  }
}

export interface VerbTableExerciseProps {
  readonly wordId: WordId
  readonly sessionId: number
  readonly tense: VerbTableTense
  readonly exercise: VerbTableExerciseData
  /** Fired once per cell, right after it's graded — the caller
   *  (`useVerbTablePracticeSession`) tallies these into the session summary. */
  onCellGraded(result: { readonly correct: boolean; readonly isNewSkill: boolean }): void
  /** "Готово" was activated — the caller closes out the session and navigates away. */
  onDone(): void
}

export function VerbTableExercise({
  wordId,
  sessionId,
  tense,
  exercise,
  onCellGraded,
  onDone,
}: VerbTableExerciseProps) {
  const [cellStates, setCellStates] = useState<Record<string, CellState>>({})
  const answeredSkillIdsRef = useRef(new Set<string>())
  const focusedAtRef = useRef(new Map<string, number>())

  async function gradeCell(cell: TableCell, rawValue: string) {
    const key = cellKey(cell)
    const value = rawValue.trim()
    if (value.length === 0) return
    if ((cellStates[key]?.status ?? 'idle') !== 'idle') return

    setCellStates((prev) => ({ ...prev, [key]: { value: rawValue, status: 'grading' } }))

    const skillId = encodeSkillId(wordId, cell.slot)
    await ensureSkill(skillId, wordId, 'verb', cell.slot)

    const cellExercise: Exercise = {
      type: 'form-input',
      lemma: exercise.lemma,
      hint: '',
      promptMode: 'lemma',
      slot: cell.slot,
      accepted: [...cell.accepted],
    }

    const isFirstAnswerInSession = !answeredSkillIdsRef.current.has(skillId)
    const now = Date.now()
    const focusedAt = focusedAtRef.current.get(key) ?? now

    const result = await submitAnswer({
      sessionId,
      mode: 'practice',
      exercise: cellExercise,
      skillId,
      wordId,
      kind: 'verb',
      answerGiven: rawValue,
      isFirstAnswerInSession,
      elapsedMs: Math.max(0, now - focusedAt),
      now,
    })
    answeredSkillIdsRef.current.add(skillId)

    const status: CellStatus = result.gradeResult.correct
      ? 'correct'
      : result.gradeResult.nearMiss
        ? 'nearMiss'
        : 'incorrect'
    setCellStates((prev) => ({ ...prev, [key]: { value: rawValue, status } }))
    onCellGraded({ correct: result.gradeResult.correct, isNewSkill: result.isNewSkill })
  }

  function statusOf(cell: TableCell): CellStatus {
    return cellStates[cellKey(cell)]?.status ?? 'idle'
  }

  const editableCells = exercise.cells.filter((c) => c.accepted.length > 0)
  const gradedCount = editableCells.filter((c) => {
    const status = statusOf(c)
    return status !== 'idle' && status !== 'grading'
  }).length
  const correctCount = editableCells.filter((c) => statusOf(c) === 'correct').length

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-foreground">{exercise.lemma}</h2>

      <div className="flex flex-col divide-y divide-border/60 border-y border-border">
        {editableCells.map((cell) => (
          <VerbTableRow
            key={cellKey(cell)}
            cell={cell}
            label={rowLabel(cell, tense)}
            state={cellStates[cellKey(cell)] ?? IDLE_STATE}
            onFocusCell={(key) => focusedAtRef.current.set(key, Date.now())}
            onChangeValue={(cell, value) =>
              setCellStates((prev) => ({ ...prev, [cellKey(cell)]: { value, status: 'idle' } }))
            }
            onSubmitCell={(cell, value) => void gradeCell(cell, value)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          Заполнено {gradedCount} из {editableCells.length}, верно {correctCount}
        </p>
        <Button type="button" onClick={onDone} className="min-h-11">
          Готово
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One row — pronoun (+ gender for `past`) label, and a live input.
// ---------------------------------------------------------------------------

const STATUS_ICON: Readonly<Partial<Record<CellStatus, LucideIcon>>> = {
  correct: CheckCircle2,
  nearMiss: AlertTriangle,
  incorrect: XCircle,
}

const STATUS_BORDER: Readonly<Record<CellStatus, string>> = {
  idle: 'border-border',
  grading: 'border-border',
  correct: 'border-success',
  nearMiss: 'border-warning',
  incorrect: 'border-error',
}

const STATUS_TEXT: Readonly<Record<CellStatus, string>> = {
  idle: '',
  grading: '',
  correct: 'text-success',
  nearMiss: 'text-warning',
  incorrect: 'text-error',
}

function VerbTableRow({
  cell,
  label,
  state,
  onFocusCell,
  onChangeValue,
  onSubmitCell,
}: {
  readonly cell: TableCell
  readonly label: { readonly pl: string; readonly ru: string }
  readonly state: CellState
  onFocusCell(key: string): void
  onChangeValue(cell: TableCell, value: string): void
  onSubmitCell(cell: TableCell, value: string): void
}) {
  const key = cellKey(cell)
  const locked = state.status !== 'idle'
  const Icon = STATUS_ICON[state.status]

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 shrink-0">
        <p className="text-sm font-medium text-foreground">{label.pl}</p>
        <p className="text-xs text-muted-foreground">{label.ru}</p>
      </div>
      <div className="relative flex-1">
        <input
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label.pl} (${label.ru})`}
          value={state.value}
          disabled={locked}
          onFocus={() => onFocusCell(key)}
          onChange={(event) => onChangeValue(cell, event.target.value)}
          onBlur={(event) => onSubmitCell(cell, event.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-11 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
            STATUS_BORDER[state.status],
          )}
        />
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn('pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2', STATUS_TEXT[state.status])}
          />
        )}
      </div>
    </div>
  )
}
