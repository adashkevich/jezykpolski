/**
 * "Обучение" block (`spec/tasks/24-settings-backup.md` §1) — four rows, all backed by
 * `useSetting` against already-established (or, for the last row, newly-added) settings
 * keys:
 *
 *  - "Новых слов в день" / "Заданий в сессии" -> `session-scope.ts`'s
 *    `DEFAULT_NEW_WORDS_BUDGET_KEY` / `DEFAULT_TARGET_SIZE_KEY` (task 13).
 *  - "Подсказка в морфологии" -> `hint-mode.ts`'s `NOUN_HINT_MODE_SETTING_KEY` (task 18).
 *    Named generically here ("в морфологии", not "для существительных") because the
 *    underlying setting already IS generic — `generateExercise` (`learning/exercises/
 *    generate.ts`) applies it to every `form-choice`/`form-input` exercise regardless of
 *    `SkillKind` (noun/verb/adj/adv), not just nouns; only its *key name* is a historical
 *    leftover from when it was built (task 18, noun exercises only existed yet). Renaming
 *    the key itself would silently drop every already-saved value — see that module's own
 *    header for why this task leaves it as-is.
 *  - "Тип задания по умолчанию" -> `default-exercise-type.ts`'s
 *    `DEFAULT_EXERCISE_TYPES_SETTING_KEY` (new in this task — see that module's header for
 *    why no such global default existed before).
 */
import {
  DEFAULT_NEW_WORDS_BUDGET,
  DEFAULT_NEW_WORDS_BUDGET_KEY,
  DEFAULT_TARGET_SIZE,
  DEFAULT_TARGET_SIZE_KEY,
} from '@/features/session-runner/lib/session-scope.ts'
import {
  NOUN_HINT_MODE_DEFAULT,
  NOUN_HINT_MODE_SETTING_KEY,
  type HintMode,
} from '@/learning/exercises/hint-mode.ts'
import {
  DEFAULT_EXERCISE_TYPES_DEFAULT,
  DEFAULT_EXERCISE_TYPES_SETTING_KEY,
  type ExerciseTypeSelection,
} from '@/learning/exercises/default-exercise-type.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { CheckboxRow } from '@/features/training-setup/components/CheckboxRow.tsx'
import { useSetting } from '../hooks/useSetting.ts'
import { SettingRow, settingSelectClassName } from './SettingRow.tsx'

const NEW_WORDS_OPTIONS = [5, 10, 15, 20, 30]
const TARGET_SIZE_OPTIONS = [10, 15, 20, 30, 50]

const HINT_MODE_OPTIONS: ReadonlyArray<{ value: HintMode; label: string }> = [
  { value: 'lemma', label: 'Лемма' },
  { value: 'translation', label: 'Перевод' },
  { value: 'random', label: 'Случайно' },
]

export function LearningSettingsSection() {
  const [newWordsBudget, setNewWordsBudget] = useSetting(
    DEFAULT_NEW_WORDS_BUDGET_KEY,
    DEFAULT_NEW_WORDS_BUDGET,
  )
  const [targetSize, setTargetSize] = useSetting(DEFAULT_TARGET_SIZE_KEY, DEFAULT_TARGET_SIZE)
  const [hintMode, setHintMode] = useSetting<HintMode>(
    NOUN_HINT_MODE_SETTING_KEY,
    NOUN_HINT_MODE_DEFAULT,
  )
  const [exerciseTypes, setExerciseTypes] = useSetting<ExerciseTypeSelection>(
    DEFAULT_EXERCISE_TYPES_SETTING_KEY,
    DEFAULT_EXERCISE_TYPES_DEFAULT,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Обучение</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        <SettingRow label="Новых слов в день">
          <select
            className={settingSelectClassName}
            value={newWordsBudget ?? DEFAULT_NEW_WORDS_BUDGET}
            onChange={(e) => setNewWordsBudget(Number(e.target.value))}
            aria-label="Новых слов в день"
          >
            {NEW_WORDS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label="Заданий в сессии">
          <select
            className={settingSelectClassName}
            value={targetSize ?? DEFAULT_TARGET_SIZE}
            onChange={(e) => setTargetSize(Number(e.target.value))}
            aria-label="Заданий в сессии"
          >
            {TARGET_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label="Подсказка в морфологии">
          <select
            className={settingSelectClassName}
            value={hintMode ?? NOUN_HINT_MODE_DEFAULT}
            onChange={(e) => setHintMode(e.target.value as HintMode)}
            aria-label="Подсказка в морфологии"
          >
            {HINT_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </SettingRow>

        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
          <span className="text-sm text-foreground">Тип задания по умолчанию</span>
          <div className="flex shrink-0 gap-3">
            <CheckboxRow
              checked={(exerciseTypes ?? DEFAULT_EXERCISE_TYPES_DEFAULT).choice}
              onChange={(checked) =>
                setExerciseTypes({
                  ...(exerciseTypes ?? DEFAULT_EXERCISE_TYPES_DEFAULT),
                  choice: checked,
                })
              }
            >
              Выбор
            </CheckboxRow>
            <CheckboxRow
              checked={(exerciseTypes ?? DEFAULT_EXERCISE_TYPES_DEFAULT).input}
              onChange={(checked) =>
                setExerciseTypes({
                  ...(exerciseTypes ?? DEFAULT_EXERCISE_TYPES_DEFAULT),
                  input: checked,
                })
              }
            >
              Ввод
            </CheckboxRow>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
