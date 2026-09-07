/**
 * "Практика" (`spec/tasks/19-practice-mode.md`, `spec/tasks/36-practice-screen-restructure.md`,
 * `spec/app-design.md` §23, FR-111...FR-114, FR-147...FR-152) — the one screen that configures
 * every Practice drill.
 *
 * Task 36 rebuilt this screen around a POS-independent "Выборка слов" (уровень/статус/
 * частотность, no more "Раздел" tabs — see `../lib/practice-config.ts`'s own header): the
 * screen's state is now `PracticeScreenState`, a single shared `LexicalWordFilter` plus one
 * `PracticeFormsConfig` per `PracticeSection`. Six collapsible/action blocks follow, in
 * usage-ranked order (`useTrainingBlockOrder`, task 33, unchanged):
 *
 *  - "Выбор перевода", "Написание по-польски", "Сопоставление" — always-open
 *    `TrainingActionBlock`s (task 36 §3: their body is one "Начать" button, hiding it behind
 *    a click only cost a tap) that sample from the shared filter with no `pos` constraint at
 *    all (`useLexicalCandidateWords`).
 *  - "Формы существительных"/"...глаголов"/"...прилагательных" — three `TrainingBlock`s (task
 *    32's disclosure component, unchanged), each carrying its own dimension/exercise-type/
 *    count settings and its own "Начать", still POS-scoped (that's the point of a forms
 *    drill). At most one is open at a time; `usePracticeCandidateWords` (paradigm-fetching,
 *    not cheap) only ever runs for the currently open section.
 *
 * State flow:
 *  1. On mount, load `PracticeScreenState` from `settings` (`PRACTICE_SCREEN_SETTING_KEY`), or
 *     migrate the legacy single-section `lastPracticeConfig` the first time, or fall back to
 *     `defaultPracticeScreenState()`. An incoming `/words` filter (`LearnFab.tsx`) overlays its
 *     level/status/frequency and — new in task 36 — picks which forms block opens by default
 *     instead of picking a tab.
 *  2. Every edit updates local `state` only; nothing is persisted until a "Начать" is pressed.
 *  3. `usePracticeCandidateWords`/`buildPracticeQueue` recompute the open forms block's own
 *     preview counts; `useLexicalCandidateWords` recomputes the shared "Найдено N слов" line
 *     and all three lexical drills' available word pool.
 *  4. Each "Начать" persists `state` and navigates — forms to `/session` with
 *     `{ practiceConfig }`, "Сопоставление" to `/practice/matching`, the two vocab drills to
 *     `/session` with `{ practiceExtra }` — same four destinations task 19/31 already wired,
 *     `session-scope.ts#parseSessionScope` unchanged.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Button } from '@/components/ui/button.tsx'
import { CONTROL_CLASS } from '@/components/ui/control.ts'
import { cn } from '@/lib/utils'
import { LEVEL_VALUES } from '@/content/codec.ts'
import type { WordQuery } from '@/content/query.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { buildPracticeQueue } from '@/learning/session/build-practice-queue.ts'
import type { PracticeSection } from '@/learning/session/session.types.ts'
import type { WordStatus } from '@/types/progress.ts'
import { MATCHING_PAIR_COUNT, VOCAB_DRILL_BATCH_SIZE, sampleWordBatch } from '@/learning/practice/lexical-batch.ts'
import { TRAINING_SECTIONS } from '../config/training-sections.ts'
import {
  DEFAULT_LEXICAL_FILTER,
  PRACTICE_CONFIG_SETTING_KEY,
  PRACTICE_SCREEN_SETTING_KEY,
  applyIncomingFilter,
  defaultPracticeScreenState,
  migrateLegacyPracticeConfig,
  practiceConfigFor,
  sectionFromFilterPos,
  type PracticeFormsConfig,
  type PracticeScreenState,
} from '../lib/practice-config.ts'
import type { PracticeConfig } from '@/learning/session/session.types.ts'
import type { PracticeExtraVariant } from '@/features/session-runner/lib/session-scope.ts'
import { usePracticeCandidateWords } from '../hooks/usePracticeCandidateWords.ts'
import { useLexicalCandidateWords } from '../hooks/useLexicalCandidateWords.ts'
import { useTrainingBlockOrder } from '../hooks/useTrainingBlockOrder.ts'
import { CheckboxRow } from './CheckboxRow.tsx'
import { DimensionGroupFieldset } from './DimensionGroupFieldset.tsx'
import { TrainingBlock } from './TrainingBlock.tsx'
import { TrainingActionBlock } from './TrainingActionBlock.tsx'

/** Task 32's original fixed block order, widened by task 36 (§3) from one `'forms'` id into
 *  three per-section ids — the order shown before any usage has been recorded, and the
 *  tiebreak order forever after (`block-usage.ts`'s `orderBlocks` doc comment). Must match the
 *  `id`s used in `blocksById`/`recordRun` calls below literally. */
const DEFAULT_BLOCK_ORDER = [
  'vocab-choice',
  'vocab-spelling',
  'matching',
  'forms-NOUN',
  'forms-ADJ',
  'forms-VERB',
] as const

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

const FORMS_BLOCK_TITLE: Readonly<Record<PracticeSection, string>> = {
  NOUN: 'Формы существительных',
  VERB: 'Формы глаголов',
  ADJ: 'Формы прилагательных',
}

const FORMS_START_ARIA_LABEL: Readonly<Record<PracticeSection, string>> = {
  NOUN: 'Начать: тренировку форм существительных',
  VERB: 'Начать: тренировку форм глаголов',
  ADJ: 'Начать: тренировку форм прилагательных',
}

const selectClassName = cn(CONTROL_CLASS, 'px-3')

/** Every dimension-content-affecting field a candidate-word refetch depends on — a single
 *  fixed, arbitrary seed (totals don't depend on it, only which *subset* becomes `items`;
 *  see `build-practice-queue.ts`'s own header) is enough for this live preview. */
const PREVIEW_SEED = 1

export function TrainingSetupScreen({ initialFilter }: { initialFilter?: WordQuery }) {
  const navigate = useNavigate()
  const [state, setState] = useState<PracticeScreenState | null>(null)
  const [starting, setStarting] = useState(false)
  // Accordion state, now scoped to the 3 forms blocks only (task 36 §3) — the 3 lexical
  // drills below have no disclosure state at all any more. At most one forms block open at a
  // time, nothing persisted — every fresh visit starts fully collapsed unless an incoming
  // `/words` filter says otherwise (see the mount effect below).
  const [openBlockId, setOpenBlockId] = useState<string | null>(null)

  function handleBlockOpenChange(id: string, open: boolean) {
    setOpenBlockId(open ? id : null)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const saved = await settingsRepo.get<PracticeScreenState | null>(PRACTICE_SCREEN_SETTING_KEY, null)
      let next: PracticeScreenState
      if (saved) {
        next = saved
      } else {
        const legacy = await settingsRepo.get<PracticeConfig | null>(PRACTICE_CONFIG_SETTING_KEY, null)
        next = legacy ? migrateLegacyPracticeConfig(legacy) : defaultPracticeScreenState()
      }
      if (initialFilter) next = applyIncomingFilter(next, initialFilter)
      if (!alive) return
      setState(next)
      // Task 36 §2 — an incoming `/words` filter with exactly one section now opens that
      // section's forms block by default, instead of the pre-task-36 tab selection.
      const filterSection = sectionFromFilterPos(initialFilter?.pos)
      if (filterSection) setOpenBlockId(`forms-${filterSection}`)
    })()
    return () => {
      alive = false
    }
    // Deliberately runs once — `initialFilter` is the router-state payload for this one
    // `/practice` visit, same "capture once" rationale `useSessionBootstrap.ts` documents
    // for its own scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Task 36 §1 — the shared, section-less filter every lexical drill samples from. Falls back
  // to the same defaults `defaultPracticeScreenState()` would use while `state` is still
  // loading, so the preview/drills can start fetching before the settings read resolves (same
  // "prefetch against a sane default" behavior this screen has always had).
  const lexicalFilter = state?.filter ?? DEFAULT_LEXICAL_FILTER
  const { wordIds: lexicalWordIds, loading: loadingLexical } = useLexicalCandidateWords(lexicalFilter)

  const matchingWordIds = lexicalWordIds && lexicalWordIds.length >= MATCHING_PAIR_COUNT ? lexicalWordIds : null
  const vocabDrillWordIds = lexicalWordIds && lexicalWordIds.length > 0 ? lexicalWordIds : null
  const vocabDrillCount = vocabDrillWordIds
    ? Math.min(VOCAB_DRILL_BATCH_SIZE, vocabDrillWordIds.length)
    : 0

  // Task 36 §2 — only the currently open forms block ever fetches paradigms: `openSection` is
  // `null` whenever no forms block (or a lexical block, which doesn't exist as a concept any
  // more) is open.
  const openSection: PracticeSection | null =
    openBlockId?.startsWith('forms-') ? (openBlockId.slice('forms-'.length) as PracticeSection) : null

  const formsWordFilter = useMemo(() => {
    if (!state || !openSection) return null
    return {
      section: openSection,
      upToLevel: state.filter.upToLevel,
      status: state.filter.status,
      topN: state.filter.topN,
    }
  }, [state, openSection])
  const { candidateWords, loading: loadingCandidates } = usePracticeCandidateWords(formsWordFilter)

  const formsPlan = useMemo(() => {
    if (!state || !openSection || candidateWords === null) return null
    return buildPracticeQueue({
      config: practiceConfigFor(state, openSection),
      candidateWords,
      seed: PREVIEW_SEED,
    })
  }, [state, openSection, candidateWords])

  // Task 33 (`spec/tasks/33-training-block-usage-ranking.md` §3) — the 6 blocks below render
  // in `order`, not the fixed `DEFAULT_BLOCK_ORDER`; declared before the `if (!state)` early
  // return like the derived values above (`react-hooks/rules-of-hooks`).
  const { order, recordRun } = useTrainingBlockOrder(DEFAULT_BLOCK_ORDER)

  if (!state) {
    return (
      <PageContainer>
        <PageHeader title="Практика" />
        <p role="status" aria-live="polite" className="py-8 text-center text-sm text-muted-foreground">
          Загружаем настройки…
        </p>
      </PageContainer>
    )
  }

  function updateFilter(patch: Partial<PracticeScreenState['filter']>) {
    setState((prev) => (prev ? { ...prev, filter: { ...prev.filter, ...patch } } : prev))
  }

  function toggleStatus(status: WordStatus, checked: boolean) {
    setState((prev) => {
      if (!prev) return prev
      const next = checked
        ? [...prev.filter.status, status]
        : prev.filter.status.filter((s) => s !== status)
      return { ...prev, filter: { ...prev.filter, status: next } }
    })
  }

  function updateFormsConfig(section: PracticeSection, patch: Partial<PracticeFormsConfig>) {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        formsBySection: {
          ...prev.formsBySection,
          [section]: { ...prev.formsBySection[section], ...patch },
        },
      }
    })
  }

  const openSectionForms = openSection ? state.formsBySection[openSection] : null
  const noExerciseTypeSelected = openSectionForms
    ? !openSectionForms.exerciseTypes.choice && !openSectionForms.exerciseTypes.input
    : false
  const emptyResult = formsPlan !== null && formsPlan.totalMatchingSkillCount === 0
  const canStartForms = formsPlan !== null && !emptyResult && !noExerciseTypeSelected && !starting

  async function handleStartForms(section: PracticeSection) {
    if (!state || section !== openSection || !canStartForms) return
    setStarting(true)
    recordRun(`forms-${section}`)
    const config = practiceConfigFor(state, section)
    await settingsRepo.set(PRACTICE_SCREEN_SETTING_KEY, state)
    navigate('/session', { state: { practiceConfig: config } })
  }

  // ---------------------------------------------------------------------------------------
  // The 3 lexical drills' entry points (task 27/31, widened POS-independent by task 36 §1) —
  // all 3 sample from `lexicalWordIds` above, no per-drill POS control, no "all POS" option
  // needed (there's nothing to opt into: adverbs are reachable here for the first time).
  // ---------------------------------------------------------------------------------------

  function handleStartMatching() {
    if (!matchingWordIds) return
    recordRun('matching')
    const wordIds = sampleWordBatch(matchingWordIds, MATCHING_PAIR_COUNT, Date.now())
    navigate('/practice/matching', { state: { wordIds, filter: lexicalFilter } })
  }

  function handleStartVocabDrill(variant: PracticeExtraVariant) {
    if (!vocabDrillWordIds) return
    recordRun(variant)
    const wordIds = sampleWordBatch(vocabDrillWordIds, VOCAB_DRILL_BATCH_SIZE, Date.now())
    navigate('/session', { state: { practiceExtra: { variant, wordIds, filter: lexicalFilter } } })
  }

  // "Выборка слов"'s live counter (task 36 §1 — no more "N форм" here, each forms block now
  // reports its own word/form counts in `formsCountText` below).
  const lexicalCountText =
    loadingLexical && lexicalWordIds === null
      ? 'Считаем…'
      : lexicalWordIds
        ? `Найдено ${lexicalWordIds.length.toLocaleString('ru-RU')} слов`
        : ''

  // A forms block's own "Найдено N слов, M форм" line (task 32's original wording, moved back
  // into each block by task 36 §3) — only ever non-empty for the currently open section, which
  // is the only one `formsPlan`/`loadingCandidates` are computed for.
  function formsCountText(section: PracticeSection): string {
    if (section !== openSection) return ''
    if (loadingCandidates && formsPlan === null) return 'Считаем…'
    if (!formsPlan) return ''
    return `Найдено ${formsPlan.totalMatchingWordCount.toLocaleString('ru-RU')} слов, ${formsPlan.totalMatchingSkillCount.toLocaleString('ru-RU')} форм`
  }

  function renderFormsBlock(section: PracticeSection): ReactNode {
    if (!state) return null
    const id = `forms-${section}`
    const definition = TRAINING_SECTIONS[section]
    const forms = state.formsBySection[section]
    const isOpen = openBlockId === id

    return (
      <TrainingBlock
        id={id}
        title={FORMS_BLOCK_TITLE[section]}
        summary="Что тренировать, измерения, тип и количество заданий."
        open={isOpen}
        onOpenChange={(open) => handleBlockOpenChange(id, open)}
      >
        <div className="flex flex-col gap-1">
          <p className="mb-1 text-sm font-medium text-foreground">Что тренировать</p>
          <CheckboxRow
            checked={forms.includeTranslation}
            onChange={(checked) => updateFormsConfig(section, { includeTranslation: checked })}
          >
            Перевод
          </CheckboxRow>
        </div>

        {definition.dimensionGroups.map((group) => (
          <DimensionGroupFieldset
            key={group.key}
            group={group}
            selected={forms.dimensionSelection[group.key] ?? []}
            onChange={(values) =>
              updateFormsConfig(section, {
                dimensionSelection: { ...forms.dimensionSelection, [group.key]: values },
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
              checked={forms.exerciseTypes.choice}
              onChange={(checked) =>
                updateFormsConfig(section, { exerciseTypes: { ...forms.exerciseTypes, choice: checked } })
              }
            >
              Выбор ответа
            </CheckboxRow>
            <CheckboxRow
              checked={forms.exerciseTypes.input}
              onChange={(checked) =>
                updateFormsConfig(section, { exerciseTypes: { ...forms.exerciseTypes, input: checked } })
              }
            >
              Ввод ответа
            </CheckboxRow>
          </div>
          {isOpen && noExerciseTypeSelected && (
            <p className="text-sm text-destructive">Выберите хотя бы один тип задания.</p>
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Количество заданий
          <select
            value={forms.targetSize}
            onChange={(e) => updateFormsConfig(section, { targetSize: Number(e.target.value) })}
            className={selectClassName}
          >
            {TARGET_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} заданий
              </option>
            ))}
          </select>
        </label>

        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {formsCountText(section)}
        </p>

        {isOpen && emptyResult && (
          <p className="text-sm text-destructive">
            Под эти фильтры не попало ни одного слова. Ослабьте фильтры или отметьте больше
            вариантов в «Что тренировать»/«Падежи» и т.п.
          </p>
        )}

        <Button
          type="button"
          onClick={() => void handleStartForms(section)}
          disabled={!isOpen || !canStartForms}
          aria-label={FORMS_START_ARIA_LABEL[section]}
          className="min-h-11"
        >
          Начать
        </Button>
      </TrainingBlock>
    )
  }

  const blocksById: Record<string, ReactNode> = {
    'vocab-choice': (
      <TrainingActionBlock
        title="Выбор перевода (PL → RU)"
        summary={`${vocabDrillCount} слов из текущей выборки: выберите правильный перевод из четырёх вариантов.`}
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
      </TrainingActionBlock>
    ),

    'vocab-spelling': (
      <TrainingActionBlock
        title="Написание по-польски (RU → PL)"
        summary={`${vocabDrillCount} слов из текущей выборки: наберите польское слово по буквам.`}
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
      </TrainingActionBlock>
    ),

    matching: (
      <TrainingActionBlock
        title="Сопоставление"
        summary={`Соедините ${MATCHING_PAIR_COUNT} польских слов из текущей выборки с их переводами.`}
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
      </TrainingActionBlock>
    ),

    'forms-NOUN': renderFormsBlock('NOUN'),
    'forms-ADJ': renderFormsBlock('ADJ'),
    'forms-VERB': renderFormsBlock('VERB'),
  }

  return (
    <PageContainer>
      <PageHeader title="Практика" description="Свободная тренировка — вы сами задаёте, что тренировать (FR-111)." />

      {/* "Выборка слов" (task 32 §1.1, POS removed by task 36 §1) — always expanded, never a
          `TrainingBlock`: every block below depends on it, so hiding it would mean launching a
          drill blind. */}
      <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <h2 className="font-heading text-base font-medium text-foreground">Выборка слов</h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Уровень
            <select
              value={state.filter.upToLevel ?? ''}
              onChange={(e) =>
                updateFilter({ upToLevel: (e.target.value || null) as PracticeScreenState['filter']['upToLevel'] })
              }
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
                  checked={state.filter.status.includes(option.value)}
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
              value={state.filter.topN ?? ''}
              onChange={(e) =>
                updateFilter({
                  topN: (e.target.value ? Number(e.target.value) : null) as PracticeScreenState['filter']['topN'],
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
          {lexicalCountText}
        </p>
      </section>

      {/* Task 33's usage-ranked order, now over 6 ids (task 36 §3). Each block's JSX lives in
          `blocksById`, a plain lookup table rather than 6 elements inlined in document order —
          document order is not fixed here. */}
      {order.map((id) => (
        <Fragment key={id}>{blocksById[id]}</Fragment>
      ))}
    </PageContainer>
  )
}

export default TrainingSetupScreen
