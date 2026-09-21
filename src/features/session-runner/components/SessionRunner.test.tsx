/**
 * `SessionRunner` — кнопка «Знаю» в панели фидбэка (`spec/tasks/41-mark-known-all-translation-stages.md`).
 *
 * Тесты гоняют настоящий `SessionRunner` поверх настоящей (fake-indexeddb) базы через
 * `useSessionBootstrap` — то же соглашение, что у `useSessionBootstrap.test.ts` и
 * `SessionMatchingBlock.test.tsx`: `paradigmShard: -1` (парадигмы не нужны), пустой
 * stub для `fetch` (senses не нужны, варианты выбора берутся из индекса). Так проверяется не
 * отдельная функция, а весь путь «ответ → запись → решение о показе → нажатие → запись»,
 * на котором кнопка и должна работать.
 *
 * Первая группа — воспроизведение из §«Зачем» п. 2 задачи 41: четыре сценария, в которых
 * пользователь якобы не видит «Знаю» после первого верного ответа. Причина найдена в журнале
 * решений `00-progress.md`; эти тесты закрепляют результат.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunner } from './SessionRunner.tsx'
import { useSessionBootstrap } from '../hooks/useSessionBootstrap.ts'
import type { SessionScope } from '../lib/session-scope.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getDailyStats } from '@/db/repositories/daily-stats.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { getSession } from '@/db/repositories/sessions.repository.ts'
import { getSkill, getSkillsForWord, upsertSkill } from '@/db/repositories/skills.repository.ts'
import { toLocalDateKey } from '@/lib/dates.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import type { VocabDimension } from '@/learning/skills/dimensions.ts'
import { SWIPE_KNOWN_DUE_DAYS } from '@/learning/srs/policy.ts'
import { encodeSkillId, encodeWordId, type SkillId } from '@/learning/skills/skill-id.ts'
import { useSessionStore } from '@/stores/session.store.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

const DAY_MS = 24 * 60 * 60 * 1000

const WORDS = [
  { lemma: 'kobieta', ru: 'женщина' },
  { lemma: 'dom', ru: 'дом' },
  { lemma: 'kot', ru: 'кот' },
  { lemma: 'pies', ru: 'собака' },
  { lemma: 'okno', ru: 'окно' },
  { lemma: 'stol', ru: 'стол' },
] as const

const KOBIETA = encodeWordId('kobieta', 'NOUN')

function entry(lemma: string, primaryRu: string, rank: number): WordIndexEntry {
  return { lemma, pos: 'NOUN', rank, level: 'A1', primaryRu, sensesShard: 0, paradigmShard: -1 }
}

function skillId(dimension: VocabDimension): SkillId {
  return encodeSkillId(KOBIETA, dimension)
}

/** Запись навыка `kobieta` в состоянии «новый, к повторению прямо сейчас» — как её создаёт
 *  `ensureSkill`. `overrides` доводят её до нужного состояния. */
function skillRecord(dimension: VocabDimension, overrides: Partial<SkillRecord> = {}): SkillRecord {
  const now = Date.now()
  return {
    skillId: skillId(dimension),
    wordId: KOBIETA,
    kind: 'vocab',
    dimension,
    state: 'new',
    stability: 0,
    difficulty: 0,
    due: now,
    reps: 0,
    lapses: 0,
    correct: 0,
    incorrect: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Навык, который уже повторяли и который ждёт следующего повтора через `dueInDays` дней. */
function reviewedSkill(
  dimension: VocabDimension,
  stability: number,
  dueInDays: number,
): SkillRecord {
  const now = Date.now()
  return skillRecord(dimension, {
    state: 'review',
    stability,
    difficulty: 5,
    reps: 3,
    correct: 3,
    correctStreak: 3,
    due: now + dueInDays * DAY_MS,
    lastReviewAt: now - 5 * DAY_MS,
  })
}

async function seed(...records: SkillRecord[]) {
  for (const record of records) await upsertSkill(record)
  await recomputeWordProgress(KOBIETA)
}

async function startSession(scope: SessionScope) {
  const { result } = renderHook(() => useSessionBootstrap(scope))
  await waitFor(() => expect(result.current.status.phase).toBe('ready'))
  const status = result.current.status
  if (status.phase !== 'ready') throw new Error('session did not reach the ready phase')
  render(<SessionRunner runtime={status.runtime} onFinished={() => {}} />)
  return status.runtime
}

function currentSkillId(): SkillId {
  const { queue, currentIndex } = useSessionStore.getState()
  return queue[currentIndex]!.skillId as SkillId
}

/** Заголовок вопроса — лемма (`pl-ru`) или русский перевод (`ru-pl-*`). */
async function currentWord() {
  const heading = await screen.findByRole('heading', { level: 2 })
  const text = heading.textContent
  const word = WORDS.find((w) => w.lemma === text || w.ru === text)
  if (!word) throw new Error(`unexpected prompt "${text}"`)
  return word
}

/** Верный вариант ответа на вопрос с выбором: `pl-ru` — русский перевод, `ru-pl-choice` — лемма. */
async function correctOptionName(): Promise<string> {
  const word = await currentWord()
  const heading = await screen.findByRole('heading', { level: 2 })
  return heading.textContent === word.lemma ? word.ru : word.lemma
}

async function answerChoice(user: ReturnType<typeof userEvent.setup>, correct: boolean) {
  const rightAnswer = await correctOptionName()
  const options = screen.getAllByRole('radio')
  const target = correct
    ? options.find((o) => o.textContent?.includes(rightAnswer))
    : options.find((o) => !o.textContent?.includes(rightAnswer))
  await user.click(target!)
  await screen.findByRole('button', { name: 'Далее' })
}

function markKnownButton() {
  return screen.queryByRole('button', { name: 'Знаю' })
}

beforeEach(async () => {
  await openDatabase()
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
  )
  useSessionStore.getState().reset()
  initIndexStore(WORDS.map((w, i) => entry(w.lemma, w.ru, i + 1)))
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  useSessionStore.getState().reset()
  await deleteDatabase()
  __resetIndexStoreForTest()
})

// ---------------------------------------------------------------------------
// Воспроизведение (задача 41, «Зачем» п. 2): «Знаю» после ПЕРВОГО верного ответа.
// ---------------------------------------------------------------------------

describe('«Знаю» после первого верного ответа (воспроизведение задачи 41, п. 2)', () => {
  it('новое слово, этап 1 (vocab:pl-ru): показывается сразу после первого верного ответа', async () => {
    const user = userEvent.setup()
    await startSession({ kind: 'global' })
    expect(currentSkillId()).toMatch(/::vocab:pl-ru$/)
    expect(markKnownButton()).not.toBeInTheDocument()

    await answerChoice(user, true)

    expect(markKnownButton()).toBeInTheDocument()
  })

  it('слово на этапе 2 после каскада (vocab:ru-pl-choice, vocab:pl-ru уже зачтён каскадом): показывается', async () => {
    const user = userEvent.setup()
    // `vocab:pl-ru` изучен и ждёт повтора через 3 дня, `vocab:ru-pl-choice` — новый и уже к
    // повторению, поэтому в очередь попадает именно он (`collapseVocabStages`).
    await seed(reviewedSkill('vocab:pl-ru', 5, 3), skillRecord('vocab:ru-pl-choice'))
    const before = (await getSkill(skillId('vocab:pl-ru')))!
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-choice'))

    await answerChoice(user, true)

    // Каскад действительно отработал: `vocab:pl-ru` получил зачёт за этот же ответ.
    expect((await getSkill(skillId('vocab:pl-ru')))!.stability).toBeGreaterThan(before.stability)
    expect(markKnownButton()).toBeInTheDocument()
  })

  it('повтор внутри сессии после ошибки: верный ответ на повторе тоже показывает «Знаю»', async () => {
    const user = userEvent.setup()
    await startSession({ kind: 'word', wordId: KOBIETA })

    await answerChoice(user, false)
    expect(markKnownButton()).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // Повтор — новый вопрос по тому же навыку, SRS на нём не применяется (демпфирование).
    expect(useSessionStore.getState().queue).toHaveLength(2)
    await answerChoice(user, true)
    expect(markKnownButton()).toBeInTheDocument()
  })

  it('Practice-режим (practice-extra «Выбор перевода»): показывается после первого верного ответа', async () => {
    const user = userEvent.setup()
    const runtime = await startSession({
      kind: 'practice-extra',
      variant: 'vocab-choice',
      wordIds: [KOBIETA],
    })
    expect(runtime.mode).toBe('practice')

    await answerChoice(user, true)

    expect(markKnownButton()).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Что делает кнопка на этапах выбора (§2, таблица) и когда она показывается (§1, §3).
// ---------------------------------------------------------------------------

describe('«Знаю» на этапах выбора (vocab:pl-ru, vocab:ru-pl-choice)', () => {
  async function expectChoiceStagesKnownAndInputOpened(before: number, after: number) {
    for (const dimension of ['vocab:pl-ru', 'vocab:ru-pl-choice'] as const) {
      const skill = (await getSkill(skillId(dimension)))!
      expect(skill.state).toBe('review')
      expect(skill.due).toBeGreaterThanOrEqual(before + SWIPE_KNOWN_DUE_DAYS * DAY_MS)
      expect(skill.due).toBeLessThanOrEqual(after + SWIPE_KNOWN_DUE_DAYS * DAY_MS)
    }
    // `vocab:ru-pl-input` только открыт: свежая запись, к повторению сразу (в СЛЕДУЮЩЕЙ сессии).
    const input = (await getSkill(skillId('vocab:ru-pl-input')))!
    expect(input.state).toBe('new')
    expect(input.due).toBeGreaterThanOrEqual(before)
    expect(input.due).toBeLessThanOrEqual(after)
  }

  it('vocab:pl-ru: оба этапа выбора → review через 5 дней, vocab:ru-pl-input создан с due = now, сессия идёт дальше', async () => {
    const user = userEvent.setup()
    await startSession({ kind: 'global' })
    await answerChoice(user, true)
    const indexBefore = useSessionStore.getState().currentIndex

    const before = Date.now()
    await user.click(markKnownButton()!)
    await waitFor(() => expect(useSessionStore.getState().currentIndex).toBe(indexBefore + 1))
    const after = Date.now()

    await expectChoiceStagesKnownAndInputOpened(before, after)
  })

  it('vocab:ru-pl-choice: то же самое — оба этапа выбора в review, ввод открыт', async () => {
    const user = userEvent.setup()
    await seed(reviewedSkill('vocab:pl-ru', 5, 3), skillRecord('vocab:ru-pl-choice'))
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-choice'))
    await answerChoice(user, true)

    const before = Date.now()
    await user.click(markKnownButton()!)
    // Очередь из одного вопроса: после `advance` сессия сама закрывается и сбрасывает стор,
    // так что ждём записи в БД, а не индекса в сторе.
    await waitFor(async () => expect(await getSkill(skillId('vocab:ru-pl-input'))).toBeDefined())
    const after = Date.now()

    await expectChoiceStagesKnownAndInputOpened(before, after)
  })

  it('после «Знаю» из очереди уходят оставшиеся вопросы по всем трём vocab-навыкам слова', async () => {
    const user = userEvent.setup()
    await startSession({ kind: 'global' })
    expect(currentSkillId()).toBe(skillId('vocab:pl-ru'))
    const originalQueue = useSessionStore.getState().queue.map((q) => q.skillId)
    // Искусственные хвосты очереди: вопросы на оба других этапа того же слова.
    for (const dimension of ['vocab:ru-pl-choice', 'vocab:ru-pl-input'] as const) {
      const tail: ExerciseInstance = {
        id: `tail::${dimension}`,
        skillId: skillId(dimension),
        exercise: { type: 'input', direction: 'ru-pl', prompt: 'женщина', accepted: ['kobieta'] },
      }
      useSessionStore.getState().appendToQueue(tail)
    }
    await answerChoice(user, true)

    await user.click(markKnownButton()!)

    await waitFor(() => expect(useSessionStore.getState().currentIndex).toBe(1))
    // Остались только исходные вопросы; хвосты по `kobieta` ушли, соседние слова не тронуты.
    expect(useSessionStore.getState().queue.map((q) => q.skillId)).toEqual(originalQueue)
  })

  it('не показывается, когда нажатие ничего не изменит: оба этапа выбора на полу известности и ввод уже открыт', async () => {
    const user = userEvent.setup()
    // Только `vocab:pl-ru` к повторению; остальные ждут в будущем — вопрос будет один.
    await seed(
      { ...reviewedSkill('vocab:pl-ru', 40, -1), due: Date.now() - 1000 },
      reviewedSkill('vocab:ru-pl-choice', 40, 20),
      skillRecord('vocab:ru-pl-input', { due: Date.now() + 20 * DAY_MS }),
    )
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:pl-ru'))

    await answerChoice(user, true)

    expect(markKnownButton()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument()
  })

  it('показывается, если оба этапа выбора уже на полу известности, но vocab:ru-pl-input ещё не открыт', async () => {
    const user = userEvent.setup()
    await seed(
      { ...reviewedSkill('vocab:pl-ru', 40, -1), due: Date.now() - 1000 },
      reviewedSkill('vocab:ru-pl-choice', 40, 20),
    )
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:pl-ru'))

    await answerChoice(user, true)

    expect(markKnownButton()).toBeInTheDocument()
  })

  it('неверный ответ «Знаю» не показывает', async () => {
    const user = userEvent.setup()
    await startSession({ kind: 'global' })

    await answerChoice(user, false)

    expect(markKnownButton()).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Этап 3, vocab:ru-pl-input: «Знаю» только после безупречного набора.
// ---------------------------------------------------------------------------

describe('«Знаю» на vocab:ru-pl-input (задача 41 §1-2)', () => {
  /** Слово с одним открытым навыком — вводом: он единственный в очереди. */
  async function startTyping(...extra: SkillRecord[]) {
    await seed(skillRecord('vocab:ru-pl-input'), ...extra)
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-input'))
    expect((await currentWord()).ru).toBe('женщина')
    return screen.getByRole('textbox', { name: 'Ответ по-польски' })
  }

  it('безупречный набор показывает «Знаю»; нажатие переводит все три этапа в review через 5 дней', async () => {
    const user = userEvent.setup()
    const field = await startTyping()

    await user.type(field, 'kobieta')
    await screen.findByRole('button', { name: 'Далее' })
    expect(markKnownButton()).toBeInTheDocument()

    const before = Date.now()
    await user.click(markKnownButton()!)
    // До нажатия в БД только сам ввод; ждём, пока «Знаю» допишет остальные два этапа.
    await waitFor(async () => expect(await getSkillsForWord(KOBIETA)).toHaveLength(3))
    const after = Date.now()

    const skills = await getSkillsForWord(KOBIETA)
    expect(skills.map((s) => s.dimension).sort()).toEqual([
      'vocab:pl-ru',
      'vocab:ru-pl-choice',
      'vocab:ru-pl-input',
    ])
    for (const skill of skills) {
      expect(skill.state).toBe('review')
      // Ввод уже оценён самим ответом (Easy) и может уйти дальше пола; остальные — ровно на пол.
      expect(skill.due).toBeGreaterThanOrEqual(before + SWIPE_KNOWN_DUE_DAYS * DAY_MS)
    }
    for (const dimension of ['vocab:pl-ru', 'vocab:ru-pl-choice'] as const) {
      const skill = skills.find((s) => s.dimension === dimension)!
      expect(skill.due).toBeLessThanOrEqual(after + SWIPE_KNOWN_DUE_DAYS * DAY_MS)
    }
  })

  it('набор с ошибкой (верно, но с исправлением) «Знаю» не показывает', async () => {
    const user = userEvent.setup()
    const field = await startTyping()

    // Неверная первая буква, затем верное слово целиком: одна исправленная ошибка.
    await user.type(field, 'xkobieta')
    await screen.findByRole('button', { name: 'Далее' })

    expect(screen.getByText('Верно, но с исправлением')).toBeInTheDocument()
    expect(markKnownButton()).not.toBeInTheDocument()
  })

  it('набор с подсказкой «Знаю» не показывает', async () => {
    const user = userEvent.setup()
    const field = await startTyping()

    await user.click(screen.getByRole('button', { name: 'Подсказка: показать следующую букву' }))
    await user.type(field, 'obieta')
    await screen.findByRole('button', { name: 'Далее' })

    expect(screen.getByText('Верно, но с подсказкой')).toBeInTheDocument()
    expect(markKnownButton()).not.toBeInTheDocument()
  })

  it('«глазок» («Показать слово») «Знаю» не показывает', async () => {
    const user = userEvent.setup()
    await startTyping()

    await user.click(screen.getByRole('button', { name: /^Показать слово/ }))
    await screen.findByRole('button', { name: 'Далее' })

    expect(markKnownButton()).not.toBeInTheDocument()
  })

  it('показывается, если оба этапа выбора уже известны, а сам ввод ещё нет — проверка по выбору здесь скрыла бы её зря', async () => {
    const user = userEvent.setup()
    const field = await startTyping(
      reviewedSkill('vocab:pl-ru', 40, 20),
      reviewedSkill('vocab:ru-pl-choice', 40, 20),
    )

    await user.type(field, 'kobieta')
    await screen.findByRole('button', { name: 'Далее' })

    expect(markKnownButton()).toBeInTheDocument()
  })

  it('не показывается, когда все три этапа уже на полу известности', async () => {
    const user = userEvent.setup()
    await seed(
      reviewedSkill('vocab:pl-ru', 40, 20),
      reviewedSkill('vocab:ru-pl-choice', 40, 20),
      { ...reviewedSkill('vocab:ru-pl-input', 40, -1), due: Date.now() - 1000 },
    )
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-input'))

    await user.type(screen.getByRole('textbox', { name: 'Ответ по-польски' }), 'kobieta')
    await screen.findByRole('button', { name: 'Далее' })

    expect(markKnownButton()).not.toBeInTheDocument()
  })

  it('Practice-режим («Написание по-польски»): безупречный набор тоже показывает «Знаю»', async () => {
    const user = userEvent.setup()
    const runtime = await startSession({
      kind: 'practice-extra',
      variant: 'vocab-spelling',
      wordIds: [KOBIETA],
    })
    expect(runtime.mode).toBe('practice')
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-input'))

    await user.type(screen.getByRole('textbox', { name: 'Ответ по-польски' }), 'kobieta')
    await screen.findByRole('button', { name: 'Далее' })

    expect(markKnownButton()).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Задача 43: «Показать слово» возвращает слово к узнаванию, «Знаю» снимает блокировку ввода.
// ---------------------------------------------------------------------------

describe('«Показать слово» и блокировка ввода (задача 43)', () => {
  it('«Показать слово» на вводе: младшие этапы к повтору сейчас с серией 0, ввод заблокирован', async () => {
    const user = userEvent.setup()
    await seed(
      reviewedSkill('vocab:pl-ru', 40, 20),
      reviewedSkill('vocab:ru-pl-choice', 40, 20),
      { ...reviewedSkill('vocab:ru-pl-input', 40, -1), due: Date.now() - 1000 },
    )
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-input'))

    const before = Date.now()
    await user.click(screen.getByRole('button', { name: /^Показать слово/ }))
    await screen.findByRole('button', { name: 'Далее' })
    const after = Date.now()

    for (const dimension of ['vocab:pl-ru', 'vocab:ru-pl-choice'] as const) {
      const lower = (await getSkill(skillId(dimension)))!
      expect(lower.correctStreak).toBe(0)
      expect(lower.due).toBeGreaterThanOrEqual(before)
      expect(lower.due).toBeLessThanOrEqual(after)
    }
    expect((await getSkill(skillId('vocab:ru-pl-input')))!.awaitingRecognition).toBe(true)
  })

  it('«Знаю» показывается на этапе выбора, пока ввод заблокирован, хотя оба этапа выбора уже на полу известности; нажатие снимает блокировку и ставит вводу due = now', async () => {
    const user = userEvent.setup()
    await seed(
      { ...reviewedSkill('vocab:pl-ru', 40, -1), due: Date.now() - 1000 },
      reviewedSkill('vocab:ru-pl-choice', 40, 20),
      {
        ...skillRecord('vocab:ru-pl-input', { due: Date.now() + 20 * DAY_MS }),
        awaitingRecognition: true,
      },
    )
    await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:pl-ru'))

    await answerChoice(user, true)
    expect(markKnownButton()).toBeInTheDocument()

    const before = Date.now()
    await user.click(markKnownButton()!)
    await waitFor(async () =>
      expect('awaitingRecognition' in (await getSkill(skillId('vocab:ru-pl-input')))!).toBe(false),
    )
    const after = Date.now()

    const input = (await getSkill(skillId('vocab:ru-pl-input')))!
    expect(input.due).toBeGreaterThanOrEqual(before)
    expect(input.due).toBeLessThanOrEqual(after)
  })
})


// ---------------------------------------------------------------------------
// Задача 45: «точность» — только чистый первый ответ; сквозной путь через настоящий раннер.
// ---------------------------------------------------------------------------

describe('«Точность»: чистый первый ответ (задача 45)', () => {
  const today = () => toLocalDateKey(Date.now())

  async function startTyping() {
    await seed(skillRecord('vocab:ru-pl-input'))
    const runtime = await startSession({ kind: 'word', wordId: KOBIETA })
    expect(currentSkillId()).toBe(skillId('vocab:ru-pl-input'))
    return runtime
  }

  it('набор с исправленной буквой + безупречный повтор в той же сессии: точность дня и сессии — 0 из 1', async () => {
    const user = userEvent.setup()
    const runtime = await startTyping()

    // Первый ответ: неверная первая буква, затем верное слово — исправленная ошибка.
    await user.type(screen.getByRole('textbox', { name: 'Ответ по-польски' }), 'xkobieta')
    await user.click(await screen.findByRole('button', { name: 'Далее' }))

    // Слово вернулось в очередь (рейтинг Hard) — отвечаем безупречно.
    await waitFor(() => expect(useSessionStore.getState().queue).toHaveLength(2))
    await user.type(await screen.findByRole('textbox', { name: 'Ответ по-польски' }), 'kobieta')
    await user.click(await screen.findByRole('button', { name: 'Далее' }))

    // Сессия закрылась: запись сессии посчитана по чистому первому ответу.
    await waitFor(async () => expect((await getSession(runtime.sessionId))?.endedAt).toBeDefined())
    expect(await getSession(runtime.sessionId)).toMatchObject({ totalCount: 1, correctCount: 0 })

    const [first, retry] = await getLogsForSession(runtime.sessionId)
    expect(first).toMatchObject({
      correct: true,
      clean: false,
      firstInSession: true,
      assist: 'corrected',
    })
    expect(retry).toMatchObject({ correct: true, clean: true, firstInSession: false })

    const stats = await getDailyStats(today())
    expect(stats).toMatchObject({
      reviewsCount: 2,
      correctCount: 2,
      accuracyAttempts: 1,
      accuracyClean: 0,
    })
  })

  it('безупречный набор: 1 из 1 и в дне, и в записи сессии', async () => {
    const user = userEvent.setup()
    const runtime = await startTyping()

    await user.type(screen.getByRole('textbox', { name: 'Ответ по-польски' }), 'kobieta')
    await user.click(await screen.findByRole('button', { name: 'Далее' }))

    await waitFor(async () => expect((await getSession(runtime.sessionId))?.endedAt).toBeDefined())
    expect(await getSession(runtime.sessionId)).toMatchObject({ totalCount: 1, correctCount: 1 })
    expect(await getDailyStats(today())).toMatchObject({ accuracyAttempts: 1, accuracyClean: 1 })
  })
})
