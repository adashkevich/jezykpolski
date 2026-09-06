/**
 * "Настройка тренировки" (`spec/tasks/19-practice-mode.md`, `spec/app-design.md` §23,
 * FR-111...FR-114) — the ONE component that configures Practice for all three sections
 * (NOUN/VERB/ADJ, acceptance point 1). Parameterized entirely by `TRAINING_SECTIONS[section]`
 * (`../config/training-sections.ts`'s declarative `TrainingDimensionGroup[]`) — switching the
 * section tab re-renders the exact same JSX tree against a different data set, never a
 * different component.
 *
 * State flow (task text §4/§5, acceptance points 7/8):
 *  1. On mount, load the last-saved config (`settings` key `lastPracticeConfig`) and, if
 *     `initialFilter` was passed (`LearnFab.tsx`'s current `/words` filter), overlay its
 *     level/status/frequency/section on top — `../lib/practice-config.ts`'s own header spells
 *     out the exact precedence.
 *  2. Every edit updates local `config` state only; nothing is persisted until "Начать".
 *  3. `usePracticeCandidateWords` (async, content-layer) refetches only when
 *     section/level/status/frequency changes; `buildPracticeQueue` (pure, sync) recomputes
 *     the preview counts and the eligible-items count on every keystroke against whatever
 *     candidate words are already in hand — the exact same function `useSessionBootstrap.ts`
 *     calls to build the real queue (acceptance point 5).
 *  4. "Начать" persists `config` and navigates to `/session` with `{ practiceConfig: config
 *     }` — `session-scope.ts#parseSessionScope` picks it up as `{ kind: 'practice' }`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import { LEVEL_VALUES } from '@/content/codec.ts'
import type { WordQuery } from '@/content/query.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { buildPracticeQueue } from '@/learning/session/build-practice-queue.ts'
import type { PracticeConfig, PracticeSection } from '@/learning/session/session.types.ts'
import type { WordStatus } from '@/types/progress.ts'
import { PRACTICE_SECTION_TABS, TRAINING_SECTIONS } from '../config/training-sections.ts'
import {
  PRACTICE_CONFIG_SETTING_KEY,
  applyIncomingFilter,
  defaultConfigForSection,
  sectionFromFilterPos,
} from '../lib/practice-config.ts'
import type { PracticeExtraVariant } from '@/features/session-runner/lib/session-scope.ts'
import { usePracticeCandidateWords } from '../hooks/usePracticeCandidateWords.ts'
import { CheckboxRow } from './CheckboxRow.tsx'
import { DimensionGroupFieldset } from './DimensionGroupFieldset.tsx'
import { TrainingBlock } from './TrainingBlock.tsx'

const STATUS_OPTIONS: ReadonlyArray<{ value: WordStatus; label: string }> = [
  { value: 'new', label: 'Новые' },
  { value: 'learning', label: 'Изучаю' },
  { value: 'known', label: 'Знаю' },
  { value: 'mastered', label: 'Освоено' },
]

const TOP_N_OPTIONS: ReadonlyArray<{ value: PracticeConfig['topN']; label: string }> = [
  { value: null, label: 'Все' },
  { value: 500, label: 'Топ 500' },
  { value: 1000, label: 'Топ 1000' },
  { value: 2000, label: 'Топ 2000' },
  { value: 5000, label: 'Топ 5000' },
]

const TARGET_SIZE_OPTIONS: readonly number[] = [10, 20, 30, 50]

/** Task 27 (`spec/tasks/27-context-and-error-analysis.md` §4/§5) — "Сопоставление" batch
 *  size, unchanged by task 31. */
const MATCHING_PAIR_COUNT = 5

/** Task 31 (`spec/tasks/31-practice-vocabulary-drills.md` §3) — one batch-size constant for
 *  both lexical drills below ("Выбор перевода" / "Написание по-польски"). Fewer words are
 *  used when the current on-screen selection has fewer than this many (never padded). */
const VOCAB_DRILL_BATCH_SIZE = 10

const selectClassName =
  'h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

/** Every dimension-content-affecting field a candidate-word refetch depends on — a single
 *  fixed, arbitrary seed (totals don't depend on it, only which *subset* becomes `items`;
 *  see `build-practice-queue.ts`'s own header) is enough for this live preview. */
const PREVIEW_SEED = 1

/** Task 27's "Сопоставление" entry point and task 31's two vocab-drill entry points below all
 *  draw from the same seeded sample of `n` distinct items out of this screen's own
 *  already-resolved `candidateWords` — same small local mulberry32 duplicate every other
 *  seeded-sample site in this codebase uses (see `learning/session/build-practice-queue.ts`'s
 *  own header on why it's copied rather than imported). */
function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
  let a = seed >>> 0
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, Math.max(0, n))
}

export function TrainingSetupScreen({ initialFilter }: { initialFilter?: WordQuery }) {
  const navigate = useNavigate()
  const [config, setConfig] = useState<PracticeConfig | null>(null)
  const savedConfigRef = useRef<PracticeConfig | null>(null)
  const [starting, setStarting] = useState(false)
  // Accordion state for the collapsible blocks below "Выборка слов" (task 32 §2/§3): at most
  // one open at a time, nothing persisted — every fresh visit starts fully collapsed.
  // Deliberately untouched by `handleSectionChange` — changing the section tab changes the
  // word selection, not which block is open (task 32 §3's one behavioral note).
  const [openBlockId, setOpenBlockId] = useState<string | null>(null)

  function handleBlockOpenChange(id: string, open: boolean) {
    setOpenBlockId(open ? id : null)
  }

  useEffect(() => {
    let alive = true
    settingsRepo.get<PracticeConfig | null>(PRACTICE_CONFIG_SETTING_KEY, null).then((saved) => {
      if (!alive) return
      savedConfigRef.current = saved
      const filterSection = sectionFromFilterPos(initialFilter?.pos)
      const section: PracticeSection = filterSection ?? saved?.section ?? 'NOUN'

      let next = defaultConfigForSection(section)
      if (saved && saved.section === section) {
        next = {
          ...next,
          upToLevel: saved.upToLevel,
          status: saved.status,
          topN: saved.topN,
          includeTranslation: saved.includeTranslation,
          dimensionSelection: saved.dimensionSelection,
          exerciseTypes: saved.exerciseTypes,
          targetSize: saved.targetSize,
        }
      }
      if (initialFilter) next = applyIncomingFilter(next, initialFilter)
      setConfig(next)
    })
    return () => {
      alive = false
    }
    // Deliberately runs once — `initialFilter` is the router-state payload for this one
    // `/practice` visit, same "capture once" rationale `useSessionBootstrap.ts` documents
    // for its own scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wordFilter = useMemo(
    () =>
      config
        ? { section: config.section, upToLevel: config.upToLevel, status: config.status, topN: config.topN }
        : { section: 'NOUN' as PracticeSection, upToLevel: null, status: [], topN: null },
    [config],
  )
  const { candidateWords, loading: loadingCandidates } = usePracticeCandidateWords(wordFilter)

  const plan = useMemo(() => {
    if (!config || candidateWords === null) return null
    return buildPracticeQueue({ config, candidateWords, seed: PREVIEW_SEED })
  }, [config, candidateWords])

  // Task 27's "Сопоставление" entry point (see this component's header) — declared before
  // the `if (!config)` early return below so this `useMemo` call is never conditional
  // (`react-hooks/rules-of-hooks`).
  const matchingWordIds = useMemo(() => {
    if (!candidateWords) return null
    const ids = [...new Set(candidateWords.map((w) => w.wordId))]
    return ids.length >= MATCHING_PAIR_COUNT ? ids : null
  }, [candidateWords])

  // Task 31's (`spec/tasks/31-practice-vocabulary-drills.md` §3) two lexical drills — same
  // `candidateWords` source as "Сопоставление" above, but unlike it there is no minimum: a
  // batch of fewer than `VOCAB_DRILL_BATCH_SIZE` words is still a useful drill, only an
  // empty selection disables the button.
  const vocabDrillWordIds = useMemo(() => {
    if (!candidateWords) return null
    const ids = [...new Set(candidateWords.map((w) => w.wordId))]
    return ids.length > 0 ? ids : null
  }, [candidateWords])
  const vocabDrillCount = vocabDrillWordIds
    ? Math.min(VOCAB_DRILL_BATCH_SIZE, vocabDrillWordIds.length)
    : 0

  if (!config) {
    return (
      <PageContainer>
        <PageHeader title="Практика" />
        <p role="status" aria-live="polite" className="py-8 text-center text-sm text-muted-foreground">
          Загружаем настройки…
        </p>
      </PageContainer>
    )
  }

  const definition = TRAINING_SECTIONS[config.section]

  function handleSectionChange(section: PracticeSection) {
    setConfig((prev) => {
      if (!prev) return prev
      const base = defaultConfigForSection(section)
      const saved = savedConfigRef.current
      const overlay =
        saved && saved.section === section
          ? {
              includeTranslation: saved.includeTranslation,
              dimensionSelection: saved.dimensionSelection,
              exerciseTypes: saved.exerciseTypes,
            }
          : {}
      return {
        ...base,
        upToLevel: prev.upToLevel,
        status: prev.status,
        topN: prev.topN,
        targetSize: prev.targetSize,
        ...overlay,
      }
    })
  }

  function updateConfig(patch: Partial<PracticeConfig>) {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function toggleStatus(status: WordStatus, checked: boolean) {
    setConfig((prev) => {
      if (!prev) return prev
      const next = checked
        ? [...prev.status, status]
        : prev.status.filter((s) => s !== status)
      return { ...prev, status: next }
    })
  }

  const noExerciseTypeSelected = !config.exerciseTypes.choice && !config.exerciseTypes.input
  const emptyResult = plan !== null && plan.totalMatchingSkillCount === 0
  const canStart = plan !== null && !emptyResult && !noExerciseTypeSelected && !starting

  async function handleStart() {
    if (!config || !canStart) return
    setStarting(true)
    await settingsRepo.set(PRACTICE_CONFIG_SETTING_KEY, config)
    navigate('/session', { state: { practiceConfig: config } })
  }

  // ---------------------------------------------------------------------------------------
  // 3 more entry points on this same screen, "по духу" identical to "Начать" above but each
  // bypassing the whole `PracticeConfig`/`dimensionSelection` machinery (none of the 3 has a
  // dimension to select) — all 3 reuse THIS screen's own already-resolved `candidateWords`
  // (same section/level/status/frequency filter the user is currently looking at):
  // "Сопоставление" (task 27, `spec/tasks/27-context-and-error-analysis.md` §4/§5) samples
  // pairs from it; the two lexical drills below (task 31,
  // `spec/tasks/31-practice-vocabulary-drills.md` §3/§4) sample a batch of up to
  // `VOCAB_DRILL_BATCH_SIZE` words from the exact same pool instead of a separate frequency
  // sampler — task 27's original two "extra" entry points (a pair of Practice-only quiz
  // types testing translation-spotting and part-of-speech classification) used such a
  // separate sampler; task 31 removed both (FR-56/FR-57 cancelled) and replaced them with
  // these two.
  // ---------------------------------------------------------------------------------------

  function handleStartMatching() {
    if (!matchingWordIds) return
    const wordIds = seededSample(matchingWordIds, MATCHING_PAIR_COUNT, Date.now())
    navigate('/practice/matching', { state: { wordIds } })
  }

  function handleStartVocabDrill(variant: PracticeExtraVariant) {
    if (!vocabDrillWordIds) return
    const wordIds = seededSample(vocabDrillWordIds, VOCAB_DRILL_BATCH_SIZE, Date.now())
    navigate('/session', { state: { practiceExtra: { variant, wordIds } } })
  }

  // Live counter text for "Выборка слов" (task 32 §3 — moved here from the forms
  // configurator, unchanged computation) and, doubling as the "Настроить тренировку форм"
  // block's own summary line, a short static description of what that block configures.
  const foundCountText =
    loadingCandidates && plan === null
      ? 'Считаем…'
      : plan
        ? `Найдено ${plan.totalMatchingWordCount.toLocaleString('ru-RU')} слов, ${plan.totalMatchingSkillCount.toLocaleString('ru-RU')} форм`
        : ''

  return (
    <PageContainer>
      <PageHeader title={definition.title} description="Свободная тренировка — вы сами задаёте, что тренировать (FR-111)." />

      {/* "Выборка слов" (task 32 §1.1) — always expanded, never a `TrainingBlock`: every block
          below depends on it, so hiding it would mean launching a drill blind. */}
      <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <h2 className="font-heading text-base font-medium text-foreground">Выборка слов</h2>

        <div role="tablist" aria-label="Раздел" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {PRACTICE_SECTION_TABS.map((tab) => {
            const active = config.section === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSectionChange(tab.value)}
                className={cn(
                  'min-h-11 flex-1 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Уровень
            <select
              value={config.upToLevel ?? ''}
              onChange={(e) => updateConfig({ upToLevel: (e.target.value || null) as PracticeConfig['upToLevel'] })}
              className={selectClassName}
            >
              <option value="">Все уровни</option>
              {LEVEL_VALUES.map((level) => (
                <option key={level} value={level}>
                  До {level}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium text-foreground">Статус</legend>
            <div className="grid grid-cols-2 gap-x-3">
              {STATUS_OPTIONS.map((option) => (
                <CheckboxRow
                  key={option.value}
                  checked={config.status.includes(option.value)}
                  onChange={(checked) => toggleStatus(option.value, checked)}
                >
                  {option.label}
                </CheckboxRow>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Частотность
            <select
              value={config.topN ?? ''}
              onChange={(e) =>
                updateConfig({
                  topN: (e.target.value ? Number(e.target.value) : null) as PracticeConfig['topN'],
                })
              }
              className={selectClassName}
            >
              {TOP_N_OPTIONS.map((o) => (
                <option key={o.label} value={o.value ?? ''}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {foundCountText}
        </p>
      </section>

      {/* Preset blocks (task 32 §1.2) — no settings of their own, just a description and one
          "Начать"; collapsed by default, fixed order (task 33 makes the order dynamic). */}
      <TrainingBlock
        id="vocab-choice"
        title="Выбор перевода (PL → RU)"
        summary={`${vocabDrillCount} слов из текущей выборки: выберите правильный перевод из четырёх вариантов.`}
        open={openBlockId === 'vocab-choice'}
        onOpenChange={(open) => handleBlockOpenChange('vocab-choice', open)}
      >
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleStartVocabDrill('vocab-choice')}
          disabled={!vocabDrillWordIds}
          aria-label="Начать: выбор перевода"
          className="min-h-11"
        >
          Начать
        </Button>
        {!vocabDrillWordIds && (
          <p className="text-sm text-muted-foreground">
            Нужно хотя бы 1 слово в текущей выборке — ослабьте фильтры.
          </p>
        )}
      </TrainingBlock>

      <TrainingBlock
        id="vocab-spelling"
        title="Написание по-польски (RU → PL)"
        summary={`${vocabDrillCount} слов из текущей выборки: наберите польское слово по буквам.`}
        open={openBlockId === 'vocab-spelling'}
        onOpenChange={(open) => handleBlockOpenChange('vocab-spelling', open)}
      >
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleStartVocabDrill('vocab-spelling')}
          disabled={!vocabDrillWordIds}
          aria-label="Начать: написание по-польски"
          className="min-h-11"
        >
          Начать
        </Button>
        {!vocabDrillWordIds && (
          <p className="text-sm text-muted-foreground">
            Нужно хотя бы 1 слово в текущей выборке — ослабьте фильтры.
          </p>
        )}
      </TrainingBlock>

      <TrainingBlock
        id="matching"
        title="Сопоставление"
        summary={`Соедините ${MATCHING_PAIR_COUNT} польских слов из текущей выборки с их переводами.`}
        open={openBlockId === 'matching'}
        onOpenChange={(open) => handleBlockOpenChange('matching', open)}
      >
        <Button
          type="button"
          variant="secondary"
          onClick={handleStartMatching}
          disabled={!matchingWordIds}
          aria-label="Начать: сопоставление"
          className="min-h-11"
        >
          Начать
        </Button>
        {!matchingWordIds && (
          <p className="text-sm text-muted-foreground">
            Нужно как минимум {MATCHING_PAIR_COUNT} слов в текущей выборке — ослабьте фильтры.
          </p>
        )}
      </TrainingBlock>

      {/* "Настроить тренировку форм" (task 32 §1.3) — last block, collapsed by default; the
          title is phrased as an action ("настроить", not "тренировка форм слов") since
          opening it is the "кнопка сконфигурировать" the task text calls for. Everything the
          old flat form had — "Что тренировать", dimension groups, "Тип задания", "Количество
          заданий", the empty-selection message, and the main "Начать" — lives inside this one
          block's body, in that same order, with "Начать" last. */}
      <TrainingBlock
        id="forms"
        title="Настроить тренировку форм"
        summary="Что тренировать, измерения, тип и количество заданий — все настройки формы здесь."
        open={openBlockId === 'forms'}
        onOpenChange={(open) => handleBlockOpenChange('forms', open)}
      >
        <div className="flex flex-col gap-1">
          <p className="mb-1 text-sm font-medium text-foreground">Что тренировать</p>
          <CheckboxRow
            checked={config.includeTranslation}
            onChange={(checked) => updateConfig({ includeTranslation: checked })}
          >
            Перевод
          </CheckboxRow>
        </div>

        {definition.dimensionGroups.map((group) => (
          <DimensionGroupFieldset
            key={group.key}
            group={group}
            selected={config.dimensionSelection[group.key] ?? []}
            onChange={(values) =>
              updateConfig({
                dimensionSelection: { ...config.dimensionSelection, [group.key]: values },
              })
            }
          />
        ))}

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Тип задания</p>
          {/* Task 28: у перевода фиксированные два этапа (выбор из списка -> написание
              по-польски, FR-80), поэтому ограничение применяется только к формам слов. */}
          <p className="mb-1 text-xs text-muted-foreground">Влияет на формы слов</p>
          <div className="grid grid-cols-2 gap-x-3">
            <CheckboxRow
              checked={config.exerciseTypes.choice}
              onChange={(checked) =>
                updateConfig({ exerciseTypes: { ...config.exerciseTypes, choice: checked } })
              }
            >
              Выбор ответа
            </CheckboxRow>
            <CheckboxRow
              checked={config.exerciseTypes.input}
              onChange={(checked) =>
                updateConfig({ exerciseTypes: { ...config.exerciseTypes, input: checked } })
              }
            >
              Ввод ответа
            </CheckboxRow>
          </div>
          {noExerciseTypeSelected && (
            <p className="text-sm text-destructive">Выберите хотя бы один тип задания.</p>
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Количество заданий
          <select
            value={config.targetSize}
            onChange={(e) => updateConfig({ targetSize: Number(e.target.value) })}
            className={selectClassName}
          >
            {TARGET_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} заданий
              </option>
            ))}
          </select>
        </label>

        {emptyResult && (
          <p className="text-sm text-destructive">
            Под эти фильтры не попало ни одного слова. Ослабьте фильтры или отметьте больше
            вариантов в «Что тренировать»/«Падежи» и т.п.
          </p>
        )}

        <Button
          type="button"
          onClick={() => void handleStart()}
          disabled={!canStart}
          aria-label="Начать: тренировку форм слов"
          className="min-h-11"
        >
          Начать
        </Button>
      </TrainingBlock>
    </PageContainer>
  )
}

export default TrainingSetupScreen
