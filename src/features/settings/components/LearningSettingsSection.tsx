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
 *  - "Языки, которые я знаю" (tasks 51, 52) -> `lang-profile.ts`'s `LANG_PROFILE_SETTING_KEY`,
 *    right above "Начинать с уровня": three checkboxes (any combination, at least one), the same
 *    set the first-run screen asks. The languages decide which level that row and the level gate
 *    work with. `ContentProvider` applies a change at once (no reload); it resets neither the
 *    start level nor any progress.
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
import {
  NEW_WORDS_START_LEVEL_DEFAULT,
  NEW_WORDS_START_LEVEL_SETTING_KEY,
} from '@/learning/session/level-gate.ts'
import {
  canonicalKnownLangs,
  DEFAULT_KNOWN_LANGS,
  LANG_PROFILE_SETTING_KEY,
  parseKnownLangs,
  type LangProfile,
} from '@/learning/session/lang-profile.ts'
import { KNOWN_LANG_LABEL } from '@/lib/known-lang-labels.ts'
import { LANG_PROFILES, LEVEL_VALUES, type LevelValue } from '@/content/codec.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { CONTROL_CLASS } from '@/components/ui/control.ts'
import { cn } from '@/lib/utils'
import { CheckboxRow } from '@/features/training-setup/components/CheckboxRow.tsx'
import { useSetting } from '../hooks/useSetting.ts'
import { SettingRow } from './SettingRow.tsx'

const NEW_WORDS_OPTIONS = [5, 10, 15, 20, 30]
const TARGET_SIZE_OPTIONS = [10, 15, 20, 30, 50]

/** Same select styling every dropdown in the app shares (`SearchInput.tsx`, `FilterSheet.tsx`,
 *  `TrainingSetupScreen.tsx`'s own `selectClassName`) — task 34's `CONTROL_CLASS` plus this
 *  screen's compact `h-9`/`px-2.5` sizing (`SettingRow.tsx`'s header explains why this isn't
 *  a shared export from that file). */
const selectClassName = cn(CONTROL_CLASS, 'h-9 px-2.5')

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
  const [storedLangs, setLangs] = useSetting<unknown>(LANG_PROFILE_SETTING_KEY, DEFAULT_KNOWN_LANGS)
  const knownLangs = parseKnownLangs(storedLangs)

  function toggleLang(lang: LangProfile, ticked: boolean) {
    const next = ticked ? [...knownLangs, lang] : knownLangs.filter((known) => known !== lang)
    // Never an empty set: the last ticked box is disabled, this only guards a stray event.
    if (next.length > 0) void setLangs([...canonicalKnownLangs(next)])
  }
  const [startLevel, setStartLevel] = useSetting<LevelValue>(
    NEW_WORDS_START_LEVEL_SETTING_KEY,
    NEW_WORDS_START_LEVEL_DEFAULT,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Обучение</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        <SettingRow label="Новых слов в день">
          <select
            className={selectClassName}
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
            className={selectClassName}
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
            className={selectClassName}
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
          <span className="flex flex-col text-sm text-foreground">
            Тип задания по умолчанию
            {/* Task 28/37: у перевода фиксированные три этапа (выбор перевода, узнавание
                по-польски, написание по-польски, FR-80) — переключить их тип напрямую нельзя,
                поэтому для перевода этот флажок вместо смены типа исключает соответствующий
                этап из очереди (`session-scope.ts#filterForVocabExerciseType`), а «только
                ввод» ещё и не даёт вводить новые слова. Исключённые повторения никуда не
                деваются — они просто копятся просроченными, пока настройка включена. */}
            <span className="text-xs text-muted-foreground">
              Влияет на формы слов и на перевод
            </span>
          </span>
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

        {/* Task 35 (`spec/tasks/35-level-gated-new-words.md` §3) — a valve for anyone who
            isn't starting from zero: without it, a B1 learner would have to page through
            ~2000 A1 words in the daily session before ever reaching their own level. Only
            gates which NEW words the session may introduce (`level-gate.ts#unlockedLevels`,
            wired in `session-scope.ts#resolveGlobalScope`) — changing it never touches
            already-started words, which stay in their normal review schedule regardless. */}
        {/* Tasks 51, 52 (`spec/tasks/51-language-profile.md` §1) — which level the gate, filters
            and stats use, and which extra translations the word card and the exercise feedback
            show. Questions and answers stay Russian whatever is ticked. */}
        <fieldset className="flex flex-col py-1">
          <legend className="py-1 text-sm text-foreground">Языки, которые я знаю</legend>
          {LANG_PROFILES.map((lang) => {
            const ticked = knownLangs.includes(lang)
            return (
              <CheckboxRow
                key={lang}
                checked={ticked}
                disabled={ticked && knownLangs.length === 1}
                onChange={(next) => toggleLang(lang, next)}
              >
                {KNOWN_LANG_LABEL[lang]}
              </CheckboxRow>
            )
          })}
        </fieldset>
        <p className="text-xs text-muted-foreground">
          Можно отметить несколько, но хотя бы один нужен. От выбора зависят уровни слов.
          Беларуские или украинские переводы видны на карточке слова и после ответа.
        </p>

        <SettingRow label="Начинать с уровня">
          <select
            className={selectClassName}
            value={startLevel ?? NEW_WORDS_START_LEVEL_DEFAULT}
            onChange={(e) => setStartLevel(e.target.value as LevelValue)}
            aria-label="Начинать с уровня"
          >
            {LEVEL_VALUES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </SettingRow>
        <p className="text-xs text-muted-foreground">
          Новые слова в ежедневной сессии берутся с этого уровня и выше. Уровни ниже не
          предлагаются.
        </p>
      </CardContent>
    </Card>
  )
}
