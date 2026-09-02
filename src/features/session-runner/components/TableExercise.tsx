/**
 * `table` exercise — the full NOUN case x number declension grid, filled in one cell at a
 * time (`spec/tasks/18-noun-exercises.md` step 4, FR-62, `spec/app-design.md` §10 "Вариант
 * C"). Practice-only — see `../hooks/useTablePracticeSession.ts`'s header for why this whole
 * feature is a dedicated entry point rather than another `SessionRunner`-registry component:
 * unlike every other exercise type, one `table` instance covers ~12 independently-graded
 * skills at once, which doesn't fit `ExerciseProps<E>`'s one-`onAnswer` contract at all.
 *
 * Grading mechanics (task text step 5, and this task's own instruction to decide "when
 * exactly to grade — on blur, on a 'Проверить' click, etc." and justify it): each cell grades
 * itself independently **on blur** (and Enter, which just blurs the field) once it has a
 * non-empty value and hasn't been graded yet. This was chosen over a single page-level
 * "Проверить" button for two reasons: (1) it's the natural Anki-style table-drill rhythm —
 * fill a cell, Tab to the next, get immediate feedback, exactly what a dense 12-cell grid
 * wants — and (2) Tab already blurs the current field as a browser default, so "blur grades"
 * and "Tab moves to the next cell" fall out of the same one gesture for free, which is also
 * what makes the acceptance point 9 keyboard-flow requirement ("переход по Tab между
 * ячейками работает") true without any custom `tabIndex`/focus-management code here — cells
 * are just ordinary `<input>`s in DOM order. An empty cell left empty on blur (e.g. Tabbing
 * past one the user doesn't know) is simply left ungraded, never auto-marked wrong — matches
 * `InputExercise.tsx`'s own "Проверить" disabled-until-non-empty convention, just triggered
 * by blur instead of a button here.
 *
 * Each cell's grading reuses `submitAnswer` (`../lib/answer-pipeline.ts`, task 13) exactly as
 * `spec/tasks/18-noun-exercises.md`'s own hint puts it — "просто дёргай его несколько раз, по
 * одному на ячейку" — with `mode: 'practice'` (so `capRatingForMode`/`applyPracticeDamping`,
 * `learning/srs/policy.ts` rule 2, apply automatically) and a synthetic single-slot
 * `form-input` `Exercise` built from that cell's own `accepted` list — precisely the "each
 * cell graded... as its own form-input-shaped comparison" `grade.ts`'s own header already
 * anticipates for `table`/`matching`. The skill is lazily materialized via `ensureSkill`
 * right before grading (mirrors `session-scope.ts#resolveSkillScope`'s same call for a single
 * table-cell click from the read-only forms table) since most paradigm slots have never been
 * drilled before.
 *
 * No Polish-diacritics quick-insert row here (unlike `FormInputExercise.tsx`) — a deliberate
 * scope trim: 9 extra 44px buttons repeated per open cell would not fit a 320px-wide grid
 * without either shrinking the input cells below a usable touch target or forcing the whole
 * page to scroll vertically for one row's helper buttons. The single-question exercises keep
 * the helper; a table drill is dense by nature and expected to be used at a later, more
 * confident stage anyway (its accompanying "Тренировать таблицей" entry point sits right next
 * to the read-only reference table, `NounFormsTable.tsx`, one screen away for a spelling
 * check).
 */
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import { CASE_DISPLAY_ORDER, CASE_LABELS } from '@/learning/skills/dimensions.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import { encodeSkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { Exercise, TableCell } from '@/learning/exercises/exercise.types.ts'
import type { CaseValue } from '@/content/codec.ts'
import { submitAnswer } from '../lib/answer-pipeline.ts'
import type { TableExerciseData } from '../hooks/useTablePracticeSession.ts'

type CellStatus = 'idle' | 'grading' | 'correct' | 'nearMiss' | 'incorrect'

interface CellState {
  readonly value: string
  readonly status: CellStatus
}

const IDLE_STATE: CellState = { value: '', status: 'idle' }

function cellKey(cell: TableCell): string {
  return cell.slot
}

export interface TableExerciseProps {
  readonly wordId: WordId
  readonly sessionId: number
  readonly exercise: TableExerciseData
  /** Fired once per cell, right after it's graded — the caller (`useTablePracticeSession`)
   *  tallies these into the session summary. */
  onCellGraded(result: { readonly correct: boolean; readonly isNewSkill: boolean }): void
  /** "Готово" was activated — the caller closes out the session and navigates away. */
  onDone(): void
}

export function TableExercise({ wordId, sessionId, exercise, onCellGraded, onDone }: TableExerciseProps) {
  const [cellStates, setCellStates] = useState<Record<string, CellState>>({})
  const answeredSkillIdsRef = useRef(new Set<string>())
  const focusedAtRef = useRef(new Map<string, number>())

  function cellFor(numberAbbrev: 'sg' | 'pl', caseValue: CaseValue): TableCell | undefined {
    const slot = `noun:${numberAbbrev}:${caseValue}`
    return exercise.cells.find((c) => c.slot === slot)
  }

  async function gradeCell(cell: TableCell, rawValue: string) {
    const key = cellKey(cell)
    const value = rawValue.trim()
    if (value.length === 0) return
    if ((cellStates[key]?.status ?? 'idle') !== 'idle') return

    setCellStates((prev) => ({ ...prev, [key]: { value: rawValue, status: 'grading' } }))

    const skillId = encodeSkillId(wordId, cell.slot)
    await ensureSkill(skillId, wordId, 'noun', cell.slot)

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
      kind: 'noun',
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

  const editableCells = exercise.cells.filter((c) => !c.prefilled && c.accepted.length > 0)
  const gradedCount = editableCells.filter((c) => {
    const status = statusOf(c)
    return status !== 'idle' && status !== 'grading'
  }).length
  const correctCount = editableCells.filter((c) => statusOf(c) === 'correct').length

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-foreground">{exercise.lemma}</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Падеж
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Ед. число
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Мн. число
              </th>
            </tr>
          </thead>
          <tbody>
            {CASE_DISPLAY_ORDER.map((caseValue) => {
              const sgCell = cellFor('sg', caseValue)
              const plCell = cellFor('pl', caseValue)
              return (
                <tr key={caseValue} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                    {CASE_LABELS[caseValue].pl}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {CASE_LABELS[caseValue].ru}
                    </span>
                  </th>
                  <TableCellSlot
                    cell={sgCell}
                    caseValue={caseValue}
                    numberLabel="liczba pojedyncza"
                    state={sgCell ? (cellStates[cellKey(sgCell)] ?? IDLE_STATE) : IDLE_STATE}
                    onFocusCell={(key) => focusedAtRef.current.set(key, Date.now())}
                    onChangeValue={(cell, value) =>
                      setCellStates((prev) => ({ ...prev, [cellKey(cell)]: { value, status: 'idle' } }))
                    }
                    onSubmitCell={(cell, value) => void gradeCell(cell, value)}
                  />
                  <TableCellSlot
                    cell={plCell}
                    caseValue={caseValue}
                    numberLabel="liczba mnoga"
                    state={plCell ? (cellStates[cellKey(plCell)] ?? IDLE_STATE) : IDLE_STATE}
                    onFocusCell={(key) => focusedAtRef.current.set(key, Date.now())}
                    onChangeValue={(cell, value) =>
                      setCellStates((prev) => ({ ...prev, [cellKey(cell)]: { value, status: 'idle' } }))
                    }
                    onSubmitCell={(cell, value) => void gradeCell(cell, value)}
                  />
                </tr>
              )
            })}
          </tbody>
        </table>
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
// One <td> — static "—", static prefilled text, or a live input.
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

function TableCellSlot({
  cell,
  caseValue,
  numberLabel,
  state,
  onFocusCell,
  onChangeValue,
  onSubmitCell,
}: {
  readonly cell: TableCell | undefined
  readonly caseValue: CaseValue
  readonly numberLabel: string
  readonly state: CellState
  onFocusCell(key: string): void
  onChangeValue(cell: TableCell, value: string): void
  onSubmitCell(cell: TableCell, value: string): void
}) {
  if (!cell || cell.accepted.length === 0) {
    return <td className="py-1.5 pr-3 text-muted-foreground">—</td>
  }

  if (cell.prefilled) {
    return <td className="py-1.5 pr-3 font-medium text-foreground">{cell.accepted.join(' / ')}</td>
  }

  const key = cellKey(cell)
  // Disabled both while a grading request is in flight (prevents a double-submit from a
  // second blur/Enter racing the first) and once graded (a cell is answered exactly once,
  // same convention as `InputExercise.tsx`'s `disabled={disabled || answered}`).
  const locked = state.status !== 'idle'
  const Icon = STATUS_ICON[state.status]

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <td className="py-1.5 pr-3">
      <div className="relative">
        <input
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${CASE_LABELS[caseValue].pl} (${CASE_LABELS[caseValue].ru}), ${numberLabel}`}
          value={state.value}
          disabled={locked}
          onFocus={() => onFocusCell(key)}
          onChange={(event) => onChangeValue(cell, event.target.value)}
          onBlur={(event) => onSubmitCell(cell, event.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-11 w-24 min-w-[5.5rem] rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
            STATUS_BORDER[state.status],
          )}
        />
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn('pointer-events-none absolute top-1/2 right-1 size-4 -translate-y-1/2', STATUS_TEXT[state.status])}
          />
        )}
      </div>
    </td>
  )
}
