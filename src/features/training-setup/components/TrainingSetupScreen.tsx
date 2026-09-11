/**
 * "Практика" (`spec/tasks/19-practice-mode.md`, `spec/tasks/36-practice-screen-restructure.md`,
 * `spec/tasks/39-practice-current-level.md`, `spec/app-design.md` §23, FR-111...FR-114,
 * FR-147...FR-152) — the one screen that configures every Practice drill.
 *
 * Task 39 removed the manual "Выборка слов" (level/status/frequency, task 36's own addition)
 * entirely: the word pool for every one of the 6 blocks below — lexical or forms — is now
 * whatever the same level gate the daily Learn session uses currently has open
 * (`useLevelGate().practiceLevel`, `@/learning/session/level-gate.ts#practicePoolLevel`), not
 * a user-chosen filter. `PracticeScreenState` is back down to just `formsBySection` (see
 * `../lib/practice-config.ts`'s own header). Six collapsible/action blocks follow, in
 * usage-ranked order (`useTrainingBlockOrder`, task 33, unchanged):
 *
 *  - "Выбор перевода", "Написание по-польски", "Сопоставление" — always-open
 *    `TrainingActionBlock`s (task 36 §3: their body is one "Начать" button, hiding it behind
 *    a click only cost a tap) that sample from the level gate's pool with no `pos` constraint
 *    at all (`useLexicalCandidateWords`).
 *  - "Формы существительных"/"...глаголов"/"...прилагательных" — three `TrainingBlock`s (task
 *    32's disclosure component, unchanged), each carrying its own dimension/exercise-type/
 *    count settings and its own "Начать", still POS-scoped (that's the point of a forms
 *    drill). At most one is open at a time; `usePracticeCandidateWords` (paradigm-fetching,
 *    not cheap) only ever runs for the currently open section.
 *
 * State flow:
 *  1. On mount, load `PracticeScreenState` (just `formsBySection` now) from `settings`
 *     (`PRACTICE_SCREEN_SETTING_KEY`), or migrate the legacy single-section
 *     `lastPracticeConfig` the first time, or fall back to `defaultPracticeScreenState()`. An
 *     incoming `/words` filter (`LearnFab.tsx`) no longer overlays anything onto screen state
 *     (there's nowhere left to put a level/status/frequency filter) — it only picks which
 *     forms block opens by default, same as task 36.
 *  2. Every edit to a forms block updates local `state` only; nothing is persisted until a
 *     "Начать" is pressed.
 *  3. `usePracticeCandidateWords`/`buildPracticeQueue` recompute the open forms block's own
 *     preview counts; `useLexicalCandidateWords` recomputes all three lexical drills' word
 *     pool from the level gate.
 *  4. Each "Начать" persists `state` and navigates — forms to `/session` with
 *     `{ practiceConfig }`, "Сопоставление" to `/practice/matching`, the two vocab drills to
 *     `/session` with `{ practiceExtra }` — same four destinations task 19/31 already wired,
 *     `session-scope.ts#parseSessionScope` unchanged in shape (just without a `filter` field
 *     on `practiceExtra` any more).
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Button } from '@/components/ui/button.tsx'
import { CONTROL_CLASS } from '@/components/ui/control.ts'
import { cn } from '@/lib/utils'
import type { WordQuery } from '@/content/query.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { useLevelGate } from '@/hooks/useLevelGate.ts'
import { buildPracticeQueue } from '@/learning/session/build-practice-queue.ts'
import type { PracticeSection } from '@/learning/session/session.types.ts'
import { MATCHING_PAIR_COUNT, VOCAB_DRILL_BATCH_SIZE, sampleWordBatch } from '@/learning/practice/lexical-batch.ts'
import { TRAINING_SECTIONS } from '../config/training-sections.ts'
import {
  PRACTICE_CONFIG_SETTING_KEY,
  PRACTICE_SCREEN_SETTING_KEY,
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
  // Accordion state, scoped to the 3 forms blocks only (task 36 §3) — the 3 lexical drills
  // below have no disclosure state at all any more. At most one forms block open at a time,
  // nothing persisted — every fresh visit starts fully collapsed unless an incoming `/words`
  // filter says otherwise (see the mount effect below).
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
      if (!alive) return
      setState(next)
      // Task 36 §2 — an incoming `/words` filter with exactly one section opens that
      // section's forms block by default, instead of the pre-task-36 tab selection. Task 39:
      // this is now the *only* thing an incoming filter affects — its level/status/frequency
      // fields have nowhere left to overlay onto.
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

  // Task 39 — the level gate's current level is the pool boundary for every block on this
  // screen. `undefined` while the underlying live queries are still loading (same as
  // `useLevelGate`'s own contract) — every block below treats that the same as "no words yet".
  const levelGate = useLevelGate()
  const practiceLevel = levelGate?.practiceLevel

  // Task 36 §1 / task 39 — every lexical drill samples from the level gate's pool, no filter
  // to key on any more (see `useLexicalCandidateWords.ts`'s own header).
  const { wordIds: lexicalWordIds, loading: loadingLexical } = useLexicalCandidateWords()

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
    if (!state || !openSection || !practiceLevel) return null
    return { section: openSection, upToLevel: practiceLevel, status: [], topN: null }
  }, [state, openSection, practiceLevel])
  const { candidateWords, loading: loadingCandidates } = usePracticeCandidateWords(formsWordFilter)

  const formsPlan = useMemo(() => {
    if (!state || !openSection || !practiceLevel || candidateWords === null) return null
    return buildPracticeQueue({
      config: practiceConfigFor(state, openSection, practiceLevel),
      candidateWords,
      seed: PREVIEW_SEED,
    })
  }, [state, openSection, practiceLevel, candidateWords])

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
    if (!state || section !== openSection || !practiceLevel || !canStartForms) return
    setStarting(true)
    recordRun(`forms-${section}`)
    const config = practiceConfigFor(state, section, practiceLevel)
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
    navigate('/practice/matching', { state: { wordIds } })
  }

  function handleStartVocabDrill(variant: PracticeExtraVariant) {
    if (!vocabDrillWordIds) return
    recordRun(variant)
    const wordIds = sampleWordBatch(vocabDrillWordIds, VOCAB_DRILL_BATCH_SIZE, Date.now())
    navigate('/session', { state: { practiceExtra: { variant, wordIds } } })
  }

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
          {/* Task 28/37: у перевода фиксированные три этапа (выбор перевода, узнавание
              по-польски, написание по-польски, FR-80) — переключить их тип напрямую нельзя,
              поэтому для перевода этот флажок вместо смены типа исключает соответствующий
              этап из выборки (`build-practice-queue.ts#vocabMatchesExerciseType`), когда
              «Перевод» включён выше. */}
          <p className="mb-1 text-xs text-muted-foreground">Влияет на формы слов и на перевод</p>
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
            Под эти условия не попало ни одного слова. Отметьте больше вариантов в «Что
            тренировать»/«Падежи» и т.п.
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
        summary={`${vocabDrillCount} слов текущего уровня: выберите правильный перевод из четырёх вариантов.`}
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
        {!vocabDrillWordIds && !loadingLexical && (
          <p className="text-sm text-muted-foreground">На текущем уровне пока нет ни одного слова.</p>
        )}
      </TrainingActionBlock>
    ),

    'vocab-spelling': (
      <TrainingActionBlock
        title="Написание по-польски (RU → PL)"
        summary={`${vocabDrillCount} слов текущего уровня: наберите польское слово по буквам.`}
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
        {!vocabDrillWordIds && !loadingLexical && (
          <p className="text-sm text-muted-foreground">На текущем уровне пока нет ни одного слова.</p>
        )}
      </TrainingActionBlock>
    ),

    matching: (
      <TrainingActionBlock
        title="Сопоставление"
        summary={`Соедините ${MATCHING_PAIR_COUNT} польских слов текущего уровня с их переводами.`}
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
        {!matchingWordIds && !loadingLexical && (
          <p className="text-sm text-muted-foreground">
            На текущем уровне пока нет {MATCHING_PAIR_COUNT} слов.
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
      <PageHeader
        title="Практика"
        description={
          practiceLevel
            ? `Свободная тренировка — слова текущего уровня (${practiceLevel} и ниже, FR-111).`
            : 'Свободная тренировка — вы сами задаёте, что тренировать (FR-111).'
        }
      />

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
