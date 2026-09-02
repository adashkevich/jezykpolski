import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest, loadParadigmShard, loadSensesShard } from '@/content/loader.ts'
import { decodeForm } from '@/content/codec.ts'
import type { DecodedForm, EncodedForm } from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import { pickFormDistractors, pickVocabDistractors } from './distractors.ts'

// ---------------------------------------------------------------------------
// This file originally tested task 09's naive placeholder body (determinism and
// well-formedness only). Task 10 replaced `distractors.ts`'s two function bodies with the
// real algorithm (`spec/architecture.md` §7.4 / `spec/tasks/10-distractors.md`) — the tests
// above this comment were written against the placeholder but describe properties the real
// algorithm also guarantees (same-POS pool, direction mapping, determinism, never
// over-returning a small pool), so they're kept as-is and still pass unmodified. The
// `describe('task 10 acceptance', ...)` block below (bottom of this file) is new: it
// exercises the 7 acceptance bullets from `spec/tasks/10-distractors.md`, using real corpus
// words (`wiedzieć`/`znać`/`mieć`/`aborcja`, and the real C2 word list) rather than
// synthetic fixtures.
// ---------------------------------------------------------------------------

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'pos'>,
): WordIndexEntry {
  return {
    rank: 1,
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([
    entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, primaryRu: 'женщина' }),
    entry({ lemma: 'człowiek', pos: 'NOUN', rank: 2, primaryRu: 'человек' }),
    entry({ lemma: 'dom', pos: 'NOUN', rank: 5, primaryRu: 'дом' }),
    entry({ lemma: 'stół', pos: 'NOUN', rank: 8, primaryRu: 'стол' }),
    entry({ lemma: 'mieć', pos: 'VERB', rank: 1, primaryRu: 'иметь' }),
    entry({ lemma: 'wiedzieć', pos: 'VERB', rank: 4, primaryRu: 'знать' }),
  ])
})

describe('pickVocabDistractors', () => {
  const target = entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, primaryRu: 'женщина' })

  it('returns n distractors from the same POS pool, excluding the target itself', () => {
    const result = pickVocabDistractors(target, 'pl-ru', 3, 42)
    expect(result).toHaveLength(3)
    expect(result).not.toContain('женщина') // target's own RU translation
    // All 3 same-POS candidates other than the target: człowiek, dom, stół -> their RU.
    expect(new Set(result)).toEqual(new Set(['человек', 'дом', 'стол']))
  })

  it('direction pl-ru returns RU translations; ru-pl returns PL lemmas', () => {
    const plRu = pickVocabDistractors(target, 'pl-ru', 3, 42)
    const ruPl = pickVocabDistractors(target, 'ru-pl', 3, 42)
    expect(new Set(plRu)).toEqual(new Set(['человек', 'дом', 'стол']))
    expect(new Set(ruPl)).toEqual(new Set(['człowiek', 'dom', 'stół']))
  })

  it('never crosses POS: a VERB target only gets VERB candidates', () => {
    const verbTarget = entry({ lemma: 'mieć', pos: 'VERB', rank: 1, primaryRu: 'иметь' })
    const result = pickVocabDistractors(verbTarget, 'pl-ru', 1, 7)
    expect(result).toEqual(['знать']) // the only other VERB in the pool
  })

  it('same seed -> byte-identical result (determinism, acceptance)', () => {
    const a = pickVocabDistractors(target, 'pl-ru', 3, 99)
    const b = pickVocabDistractors(target, 'pl-ru', 3, 99)
    expect(a).toEqual(b)
  })

  it('different seeds can produce a different order/selection', () => {
    const a = pickVocabDistractors(target, 'pl-ru', 2, 1)
    const b = pickVocabDistractors(target, 'pl-ru', 2, 2)
    // Not a strict inequality assertion (small pool could coincide), just documents intent:
    // both calls are internally consistent regardless.
    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
  })

  it('never returns more than the available pool size', () => {
    const verbTarget = entry({ lemma: 'mieć', pos: 'VERB', rank: 1, primaryRu: 'иметь' })
    const result = pickVocabDistractors(verbTarget, 'pl-ru', 10, 1)
    expect(result.length).toBeLessThanOrEqual(1) // only one other VERB exists
  })
})

// ---------------------------------------------------------------------------
// pickFormDistractors — real aborcja|NOUN plural genitive data (public/content/paradigms/023.json,
// as already established in task 03's enumerate.test.ts).
// ---------------------------------------------------------------------------

const ABORCJA_FORMS: DecodedForm[] = [
  { form: 'aborcja', number: 'singular', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'aborcji', number: 'singular', case: 'genitive', gender: 'feminine', analytic: false },
  { form: 'aborcji', number: 'singular', case: 'dative', gender: 'feminine', analytic: false },
  { form: 'aborcję', number: 'singular', case: 'accusative', gender: 'feminine', analytic: false },
  {
    form: 'aborcją',
    number: 'singular',
    case: 'instrumental',
    gender: 'feminine',
    analytic: false,
  },
  { form: 'aborcji', number: 'singular', case: 'locative', gender: 'feminine', analytic: false },
  { form: 'aborcjo', number: 'singular', case: 'vocative', gender: 'feminine', analytic: false },
  { form: 'aborcje', number: 'plural', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'aborcyj', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
  { form: 'aborcji', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
]

const ABORCJA_PARADIGM: Paradigm = { forms: ABORCJA_FORMS, dominantGender: 'feminine' }

describe('pickFormDistractors', () => {
  it('never includes any accepted answer for the target slot (aborcja pl.gen: aborcyj/aborcji)', () => {
    const result = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 5, 3)
    expect(result).not.toContain('aborcji')
    expect(result).not.toContain('aborcyj')
  })

  it('draws from other literal forms in the same paradigm', () => {
    const result = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 5, 3)
    const otherForms = ['aborcja', 'aborcję', 'aborcją', 'aborcjo', 'aborcje']
    for (const form of result) {
      expect(otherForms).toContain(form)
    }
  })

  it('same seed -> byte-identical result (determinism, acceptance)', () => {
    const a = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 3, 11)
    const b = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 3, 11)
    expect(a).toEqual(b)
  })

  it('requesting more than the available pool size does not throw, returns what exists', () => {
    expect(() => pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 999, 1)).not.toThrow()
    const result = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 999, 1)
    expect(result.length).toBeLessThan(ABORCJA_FORMS.length)
  })
})

// =============================================================================================
// Task 10 acceptance (`spec/tasks/10-distractors.md`) — the real algorithm, exercised against
// real corpus words wherever the acceptance text names one, plus every filter-relaxation branch
// named in step 5 of architecture.md §7.4 / task 10 §1-2. Ranks/levels/translations below are
// copied from the real `public/content/index.json` / `senses/*.json` (verified with a one-off
// `node -e` query against the checked-in content); a handful of ranks are deliberately nudged
// so a real word that is normally far outside another real word's ×3 rank window becomes a
// pool candidate for a given test — always called out in that test's own comment, and never
// applied to the level or translation data, which stay exactly as shipped.
// =============================================================================================

function stubContentFetch(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const href = String(url)
      const key = Object.keys(routes).find((k) => href.includes(k))
      if (key === undefined) {
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }
      return { ok: true, json: async () => routes[key] } as Response
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  __resetLoaderCachesForTest()
})

// ---------------------------------------------------------------------------
// Real-word pools, hand-copied from `public/content/index.json` / `senses/*.json` (verified
// with one-off `node -e` queries against the checked-in content — see this task's report),
// same convention as `ABORCJA_FORMS` above and `paradigms.test.ts`'s real fixtures. Not read
// from disk at test time: this project's `tsconfig.app.json` scopes `types` to
// `["vite/client"]` only (no Node globals/module ambients), which every other `src/**` test
// file already respects — reading `public/content/index.json` via `node:fs` here would fail
// `tsc -b` (the real `npm run build` step) even though a plain `vitest run` doesn't type-check
// test files against that config.
// ---------------------------------------------------------------------------

// Real VERB neighbourhood around mieć|VERB (rank 5, A1) — every rank/level/primaryRu below is
// copied as-is from the real corpus (no nudging).
const MIEC_NEIGHBOURHOOD: WordIndexEntry[] = [
  entry({ lemma: 'być', pos: 'VERB', rank: 1, level: 'A1', primaryRu: 'быть' }),
  entry({ lemma: 'mieć', pos: 'VERB', rank: 5, level: 'A1', primaryRu: 'иметь' }),
  entry({ lemma: 'móc', pos: 'VERB', rank: 8, level: 'A1', primaryRu: 'мочь' }),
  entry({ lemma: 'chcieć', pos: 'VERB', rank: 18, level: 'A1', primaryRu: 'хотеть' }),
  entry({ lemma: 'mówić', pos: 'VERB', rank: 19, level: 'A1', primaryRu: 'говорить' }),
  entry({ lemma: 'zostać', pos: 'VERB', rank: 21, level: 'B1', primaryRu: 'остаться' }),
  entry({ lemma: 'musieć', pos: 'VERB', rank: 25, level: 'A1', primaryRu: 'нужно' }),
  entry({ lemma: 'wiedzieć', pos: 'VERB', rank: 27, level: 'A1', primaryRu: 'знать' }),
  entry({ lemma: 'stać', pos: 'VERB', rank: 41, level: 'A2', primaryRu: 'стоять' }),
  entry({ lemma: 'powiedzieć', pos: 'VERB', rank: 42, level: 'A1', primaryRu: 'сказать' }),
  entry({ lemma: 'zacząć', pos: 'VERB', rank: 61, level: 'A2', primaryRu: 'начать' }),
  entry({ lemma: 'zrobić', pos: 'VERB', rank: 62, level: 'A1', primaryRu: 'сделать' }),
  entry({ lemma: 'znaleźć', pos: 'VERB', rank: 67, level: 'A2', primaryRu: 'найти' }),
  entry({ lemma: 'widzieć', pos: 'VERB', rank: 71, level: 'A1', primaryRu: 'видеть' }),
  entry({ lemma: 'powinien', pos: 'VERB', rank: 75, level: 'A2', primaryRu: 'должен' }),
  entry({ lemma: 'prowadzić', pos: 'VERB', rank: 86, level: 'B1', primaryRu: 'вести' }),
  entry({ lemma: 'chodzić', pos: 'VERB', rank: 87, level: 'A1', primaryRu: 'ходить' }),
  entry({ lemma: 'należeć', pos: 'VERB', rank: 98, level: 'B1', primaryRu: 'принадлежать' }),
  // Real NOUNs in the same store, so "never a NOUN" is an actual filter outcome, not a
  // vacuous truth from the NOUN bucket being empty.
  entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, level: 'A1', primaryRu: 'женщина' }),
  entry({ lemma: 'człowiek', pos: 'NOUN', rank: 2, level: 'A1', primaryRu: 'человек' }),
]

// Real C2 words — the corpus's real, complete C2 list is exactly these 21
// (`node -e` query against `index.json`, per this task's report) — plus real filler entries
// for POS buckets that have fewer than 3 C2 members on their own (VERB: only 2 real C2 verbs;
// ADV: only 1), so `pickVocabDistractors`'s final same-POS-no-rank-bound fallback always has
// something real to return for every one of the 21 without throwing.
const REAL_C2_WORDS: WordIndexEntry[] = [
  entry({ lemma: 'łam', pos: 'NOUN', rank: 2885, level: 'C2', primaryRu: 'колонка' }),
  entry({ lemma: 'b', pos: 'NOUN', rank: 2901, level: 'C2', primaryRu: 'бэ' }),
  entry({ lemma: 'maić', pos: 'VERB', rank: 4053, level: 'C2', primaryRu: 'украшать зеленью' }),
  entry({ lemma: 'c', pos: 'NOUN', rank: 4118, level: 'C2', primaryRu: 'цэ' }),
  entry({ lemma: 'smoleński', pos: 'ADJ', rank: 4837, level: 'C2', primaryRu: 'смоленский' }),
  entry({ lemma: 'ford', pos: 'NOUN', rank: 5362, level: 'C2', primaryRu: 'форд' }),
  entry({ lemma: 'żywiec', pos: 'NOUN', rank: 5802, level: 'C2', primaryRu: 'живой скот' }),
  entry({ lemma: 'zamojski', pos: 'ADJ', rank: 6531, level: 'C2', primaryRu: 'замойский' }),
  entry({ lemma: 'włodarz', pos: 'NOUN', rank: 6560, level: 'C2', primaryRu: 'управитель' }),
  entry({ lemma: 'piast', pos: 'NOUN', rank: 6878, level: 'C2', primaryRu: 'втулка' }),
  entry({ lemma: 'imienie', pos: 'NOUN', rank: 6892, level: 'C2', primaryRu: 'имя' }),
  entry({ lemma: 'kujawski', pos: 'ADJ', rank: 7098, level: 'C2', primaryRu: 'куявский' }),
  entry({ lemma: 'bielski', pos: 'ADJ', rank: 7206, level: 'C2', primaryRu: 'бельский' }),
  entry({ lemma: 'chorzowski', pos: 'ADJ', rank: 7278, level: 'C2', primaryRu: 'хожувский' }),
  entry({ lemma: 'chrzanowski', pos: 'ADJ', rank: 7511, level: 'C2', primaryRu: 'хжановский' }),
  entry({ lemma: 'wykładnia', pos: 'NOUN', rank: 7575, level: 'C2', primaryRu: 'толкование' }),
  entry({ lemma: 'skoda', pos: 'NOUN', rank: 7646, level: 'C2', primaryRu: 'вред' }),
  entry({ lemma: 'nader', pos: 'ADV', rank: 7706, level: 'C2', primaryRu: 'чрезвычайно' }),
  entry({ lemma: 'majdan', pos: 'NOUN', rank: 7841, level: 'C2', primaryRu: 'барахло' }),
  entry({ lemma: 'opiewać', pos: 'VERB', rank: 7874, level: 'C2', primaryRu: 'воспевать' }),
  entry({
    lemma: 'orzecznictwo',
    pos: 'NOUN',
    rank: 7997,
    level: 'C2',
    primaryRu: 'судебная практика',
  }),
]

const C2_TEST_POOL: WordIndexEntry[] = [
  ...REAL_C2_WORDS,
  // Real filler (VERB has only 2 real C2 members above; ADV only 1).
  entry({ lemma: 'być', pos: 'VERB', rank: 1, level: 'A1', primaryRu: 'быть' }),
  entry({ lemma: 'mieć', pos: 'VERB', rank: 5, level: 'A1', primaryRu: 'иметь' }),
  entry({ lemma: 'bardzo', pos: 'ADV', rank: 13, level: 'A1', primaryRu: 'очень' }),
  entry({ lemma: 'jak', pos: 'ADV', rank: 6, level: 'A1', primaryRu: 'как' }),
  entry({ lemma: 'dobrze', pos: 'ADV', rank: 47, level: 'A1', primaryRu: 'хорошо' }),
]

describe('task 10 acceptance — real corpus scenarios', () => {
  // Acceptance: "Дистракторы для mieć — глаголы A1–A2 близкой частоты, не существительные C1".
  // Real-corpus wrinkle worth recording (decision log): `mieć` is rank 5, and its *literal*
  // ×3 window ([1.67, 15]) contains exactly one other real VERB (`móc`, rank 8) — the top of
  // the frequency list is simply too sparse for a ×3 window to ever supply 3 distractors on
  // its own. `pickVocabDistractors` progressively widens the rank window (×9, then ×27 —
  // see `RANK_RELAXATION_MULTIPLIERS` in `distractors.ts`) rather than jumping straight to
  // "any same-POS word" the moment ×3 comes up short, so this asserts against the ×9 window
  // (where 6 more real A1/A2 verbs already appear) instead of the unrelaxed ×3 one.
  it('mieć: distractors are close-frequency A1/A2 verbs, never a NOUN and never a C1 word', () => {
    __resetIndexStoreForTest()
    initIndexStore(MIEC_NEIGHBOURHOOD)
    const target = MIEC_NEIGHBOURHOOD[1]! // mieć
    const result = pickVocabDistractors(target, 'ru-pl', 3, 42) // ru-pl -> lemmas, easy to re-look-up
    expect(result).toHaveLength(3)
    for (const lemma of result) {
      const candidate = MIEC_NEIGHBOURHOOD.find((e) => e.lemma === lemma)
      expect(candidate).toBeDefined()
      expect(candidate!.pos).toBe('VERB') // never a NOUN
      expect(['A1', 'A2']).toContain(candidate!.level) // "близкой частоты" A1-A2, not C1
      expect(candidate!.rank).toBeGreaterThanOrEqual(target.rank / 9)
      expect(candidate!.rank).toBeLessThanOrEqual(target.rank * 9)
    }
  })

  // Acceptance: "Для слова уровня C2 генерация не падает и возвращает n вариантов" — every one
  // of the corpus's 21 real C2 words, not just one.
  it('every real C2 word (21 total) generates n distractors without throwing', () => {
    __resetIndexStoreForTest()
    initIndexStore(C2_TEST_POOL)
    expect(REAL_C2_WORDS).toHaveLength(21) // sanity: matches the corpus's real C2 count
    for (const target of REAL_C2_WORDS) {
      let result: string[] = []
      expect(() => {
        result = pickVocabDistractors(target, 'pl-ru', 3, 7)
      }).not.toThrow()
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3) // no duplicate options
    }
  })
})

// ---------------------------------------------------------------------------
// Curated real-word pools — small enough to reason about exactly which relaxation branch
// (task 10 §1 step 5) fires, while every lemma/level/translation is copied from real content.
// ---------------------------------------------------------------------------

describe('task 10 acceptance — translation-overlap exclusion (FR-92)', () => {
  // Real ranks/levels/translations for wiedzieć|VERB (rank 27, A1, senses shard 14) and its
  // real A1 neighbours chcieć/mówić/musieć (ranks 18/19/25 — genuinely inside wiedzieć's real
  // ×3 window [9,81], no nudging needed). znać|VERB's real rank is 126 (outside that window on
  // its own) — nudged to 30 here purely so the rank filter alone can't be the reason it's
  // excluded; its level (A1) and its real translations (знать / быть знакомым с) are untouched.
  const WIEDZIEC_POOL: WordIndexEntry[] = [
    entry({
      lemma: 'wiedzieć',
      pos: 'VERB',
      rank: 27,
      level: 'A1',
      primaryRu: 'знать',
      sensesShard: 14,
    }),
    entry({
      lemma: 'znać',
      pos: 'VERB',
      rank: 30,
      level: 'A1',
      primaryRu: 'знать',
      sensesShard: 2,
    }),
    entry({ lemma: 'chcieć', pos: 'VERB', rank: 18, level: 'A1', primaryRu: 'хотеть' }),
    entry({ lemma: 'mówić', pos: 'VERB', rank: 19, level: 'A1', primaryRu: 'говорить' }),
    entry({ lemma: 'musieć', pos: 'VERB', rank: 25, level: 'A1', primaryRu: 'нужно' }),
  ]

  const WIEDZIEC_SENSES = {
    'wiedzieć|VERB': [{ ru: ['знать', 'ведать'], primary: true }],
    'znać|VERB': [
      { ru: ['знать', 'быть знакомым с'], primary: true },
      { ru: ['знать'], primary: false },
      { ru: ['знать'], primary: false },
    ],
  }

  beforeEach(() => {
    __resetIndexStoreForTest()
    initIndexStore(WIEDZIEC_POOL)
  })

  // Acceptance: "Дистракторы для wiedzieć не содержат znać и других слов с переводом «знать»".
  it('wiedzieć never picks znać (both translate as "знать") once senses shards are warmed', async () => {
    stubContentFetch({ 'senses/014.json': WIEDZIEC_SENSES, 'senses/002.json': WIEDZIEC_SENSES })
    await loadSensesShard(14)
    await loadSensesShard(2)

    const target = WIEDZIEC_POOL[0]!
    const result = pickVocabDistractors(target, 'pl-ru', 3, 5)
    expect(result).not.toContain('знать')
    expect(new Set(result)).toEqual(new Set(['хотеть', 'говорить', 'нужно']))
  })

  it('same check holds for every seed 0..49 (no seed accidentally re-admits znać)', async () => {
    stubContentFetch({ 'senses/014.json': WIEDZIEC_SENSES, 'senses/002.json': WIEDZIEC_SENSES })
    await loadSensesShard(14)
    await loadSensesShard(2)
    const target = WIEDZIEC_POOL[0]!
    for (let seed = 0; seed < 50; seed++) {
      expect(pickVocabDistractors(target, 'pl-ru', 3, seed)).not.toContain('знать')
    }
  })

  // Real zostać|VERB (rank 21, B1, primary "остаться", real secondary sense "стать") /
  // powstać|VERB (real primary "привстать", real secondary senses include "стать") pair — the
  // exact `architecture.md` §7.4 warning in miniature: the two primaries don't match, only a
  // *secondary* sense does, so this can only be caught by comparing the full translation set,
  // not just `primaryRu`. powstać's real rank is 306; nudged to 24 (inside zostać's real ×3
  // window [7,63]) purely so it's a rank/level-eligible candidate — its level (B1, matching
  // zostać's own) and its translations are real content, not adjusted.
  const ZOSTAC_POOL: WordIndexEntry[] = [
    entry({
      lemma: 'zostać',
      pos: 'VERB',
      rank: 21,
      level: 'B1',
      primaryRu: 'остаться',
      sensesShard: 10,
    }),
    entry({
      lemma: 'powstać',
      pos: 'VERB',
      rank: 24,
      level: 'B1',
      primaryRu: 'привстать',
      sensesShard: 11,
    }),
    entry({ lemma: 'stać', pos: 'VERB', rank: 41, level: 'A2', primaryRu: 'стоять' }),
    entry({ lemma: 'zacząć', pos: 'VERB', rank: 61, level: 'A2', primaryRu: 'начать' }),
  ]

  const ZOSTAC_SENSES = {
    'zostać|VERB': [{ ru: ['остаться', 'стать'], primary: true }],
    // Trimmed real excerpt of powstać|VERB's actual (much longer) sense list — keeps the one
    // overlapping translation ("стать") plus two others, drops the rest for readability.
    'powstać|VERB': [{ ru: ['привстать', 'встать', 'стать'], primary: true }],
  }

  it('excludes a candidate that overlaps only in a SECONDARY sense (zostać/powstać share "стать", not their primaries)', async () => {
    __resetIndexStoreForTest()
    initIndexStore(ZOSTAC_POOL)
    stubContentFetch({ 'senses/010.json': ZOSTAC_SENSES, 'senses/011.json': ZOSTAC_SENSES })
    await loadSensesShard(10)
    await loadSensesShard(11)

    const target = ZOSTAC_POOL[0]!
    const result = pickVocabDistractors(target, 'pl-ru', 3, 3)
    expect(result).not.toContain('привстать')
    // Real content only offers 2 other genuinely non-overlapping same-POS/rank/level
    // candidates here once powstać is (correctly) excluded — task 10 §1 step 5's relaxation
    // still can't manufacture a 3rd out of nothing, and mustn't ever throw trying.
    expect(result.length).toBeLessThanOrEqual(3)
    expect(new Set(result)).toEqual(new Set(['стоять', 'начать']))
  })

  // Documents the sync/async limitation this file's header + `distractors.ts`'s header
  // describe: without a warmed senses shard for a candidate, translation-overlap exclusion
  // can only fall back to the index's already-synchronous `primaryRu`, so a secondary-sense
  // overlap on an *unwarmed* candidate is not caught. The workaround (documented in the task
  // report) is the same pattern `exercise.types.ts`'s `ContentContext` already prescribes for
  // the target word: whoever drives exercise generation should warm the relevant senses
  // shards (`getAllTranslations`/`loadSensesShard`) before calling `pickVocabDistractors`.
  it('documented limitation: an unwarmed candidate shard falls back to primaryRu-only comparison', () => {
    __resetIndexStoreForTest()
    initIndexStore(ZOSTAC_POOL)
    // No stubContentFetch / loadSensesShard call this time -- resolvedSensesShards is empty.
    const target = ZOSTAC_POOL[0]!
    const result = pickVocabDistractors(target, 'pl-ru', 3, 3)
    // primaryRu alone ("остаться" vs "привстать") shows no overlap, so powstać is NOT
    // filtered out here -- the known, documented boundary of the best-effort fallback.
    expect(result).toContain('привстать')
  })
})

describe('task 10 acceptance — filter-relaxation branches (§1 step 5)', () => {
  // Real VERB neighbourhood around zostać|VERB (rank 21, B1) — all ranks/levels/translations
  // are real, none nudged: móc/chcieć/mówić/musieć/wiedzieć/powiedzieć/zrobić are real A1
  // verbs, stać/zacząć real A2 verbs, all genuinely inside zostać's real ×3 rank window
  // [7,63]. Strictly by rank+level (B1 ±1 = A2/B1/C1), only stać and zacząć qualify (2 < 3) —
  // this is what forces the step-5 level-relaxation branch to fire for real production data.
  const ZOSTAC_NEIGHBOURHOOD: WordIndexEntry[] = [
    entry({ lemma: 'zostać', pos: 'VERB', rank: 21, level: 'B1', primaryRu: 'остаться' }),
    entry({ lemma: 'móc', pos: 'VERB', rank: 8, level: 'A1', primaryRu: 'мочь' }),
    entry({ lemma: 'chcieć', pos: 'VERB', rank: 18, level: 'A1', primaryRu: 'хотеть' }),
    entry({ lemma: 'mówić', pos: 'VERB', rank: 19, level: 'A1', primaryRu: 'говорить' }),
    entry({ lemma: 'musieć', pos: 'VERB', rank: 25, level: 'A1', primaryRu: 'нужно' }),
    entry({ lemma: 'wiedzieć', pos: 'VERB', rank: 27, level: 'A1', primaryRu: 'знать' }),
    entry({ lemma: 'stać', pos: 'VERB', rank: 41, level: 'A2', primaryRu: 'стоять' }),
    entry({ lemma: 'powiedzieć', pos: 'VERB', rank: 42, level: 'A1', primaryRu: 'сказать' }),
    entry({ lemma: 'zacząć', pos: 'VERB', rank: 61, level: 'A2', primaryRu: 'начать' }),
    entry({ lemma: 'zrobić', pos: 'VERB', rank: 62, level: 'A1', primaryRu: 'сделать' }),
  ]

  it('level relaxation (step 5, first relaxation): strict rank+level pool has only 2 candidates for n=3', () => {
    __resetIndexStoreForTest()
    initIndexStore(ZOSTAC_NEIGHBOURHOOD)
    const target = ZOSTAC_NEIGHBOURHOOD[0]!
    const result = pickVocabDistractors(target, 'pl-ru', 3, 11)
    // Impossible to reach length 3 from the strict {A2,B1,C1}-only pool (stać + zacząć = 2) --
    // reaching 3 is itself the proof the level filter was relaxed, admitting real A1 verbs too.
    expect(result).toHaveLength(3)
  })

  // Real NOUN pool where target orzecznictwo|NOUN (real: rank 7997, C2) is so infrequent that
  // even its real ×3 rank window [2666, 23991] excludes kobieta/dom/stół (real ranks 3/5/8,
  // real A1 level) entirely -- exercising BOTH relaxation steps (level, then rank) in one
  // real-word scenario, ending at "same POS, no other constraint".
  it('rank + level relaxation (step 5, both relaxations): sparse C2 target falls back to the full same-POS pool', () => {
    __resetIndexStoreForTest()
    const orzecznictwo = entry({
      lemma: 'orzecznictwo',
      pos: 'NOUN',
      rank: 7997,
      level: 'C2',
      primaryRu: 'судебная практика',
    })
    initIndexStore([
      orzecznictwo,
      entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, level: 'A1', primaryRu: 'женщина' }),
      entry({ lemma: 'dom', pos: 'NOUN', rank: 5, level: 'A1', primaryRu: 'дом' }),
      entry({ lemma: 'stół', pos: 'NOUN', rank: 8, level: 'A1', primaryRu: 'стол' }),
    ])
    const result = pickVocabDistractors(orzecznictwo, 'pl-ru', 3, 2)
    expect(new Set(result)).toEqual(new Set(['женщина', 'дом', 'стол']))
  })
})

describe('task 10 acceptance — pickFormDistractors same-slot-from-similar-word fallback (§2)', () => {
  // Real bardzo|ADV paradigm (public/content/paradigms/032.json): only 3 forms total
  // (positive/comparative/superlative), so once the comparative slot's own accepted answer
  // ("bardziej") is excluded, only 2 forms remain in the same paradigm -- one short of n=3.
  // `BARDZO_RAW`/`DOBRZE_RAW` are the real *wire*-format rows (`EncodedForm` tuples, exactly
  // as they appear in the real shard JSON); `decodeForm` turns them into the `Paradigm` shape
  // `pickFormDistractors` actually consumes, same as `loadParadigmShard` does at runtime.
  const BARDZO_RAW: EncodedForm[] = [
    ['najbardziej', 0, 0, 0, 3, 0, 0, 0, 0, 0],
    ['bardzo', 0, 0, 0, 1, 0, 0, 0, 0, 0],
    ['bardziej', 0, 0, 0, 2, 0, 0, 0, 0, 0],
  ]
  const BARDZO_PARADIGM: Paradigm = { forms: BARDZO_RAW.map(decodeForm) }

  // Real dobrze|ADV paradigm (public/content/paradigms/028.json) — irregular comparative
  // "lepiej", distinct from bardzo's own "bardziej".
  const DOBRZE_RAW: EncodedForm[] = [
    ['dobrze', 0, 0, 0, 1, 0, 0, 0, 0, 0],
    ['lepiej', 0, 0, 0, 2, 0, 0, 0, 0, 0],
    ['najlepiej', 0, 0, 0, 3, 0, 0, 0, 0, 0],
  ]

  beforeEach(() => {
    __resetIndexStoreForTest()
    initIndexStore([
      entry({
        lemma: 'bardzo',
        pos: 'ADV',
        rank: 13,
        level: 'A1',
        primaryRu: 'очень',
        paradigmShard: 32,
      }),
      entry({
        lemma: 'dobrze',
        pos: 'ADV',
        rank: 47,
        level: 'A1',
        primaryRu: 'хорошо',
        paradigmShard: 28,
      }),
    ])
  })

  it("falls back to another ADV word's same slot when bardzo's own paradigm is too small (n=3, only 2 own forms)", async () => {
    stubContentFetch({
      'paradigms/032.json': { 'bardzo|ADV': { forms: BARDZO_RAW } },
      'paradigms/028.json': { 'dobrze|ADV': { forms: DOBRZE_RAW } },
    })
    await loadParadigmShard(32)
    await loadParadigmShard(28)

    const result = pickFormDistractors(BARDZO_PARADIGM, 'adv:degree:comparative', 3, 4)
    expect(result).not.toContain('bardziej') // the slot's own accepted answer
    expect(result).toContain('lepiej') // fallback: dobrze's own comparative form
    expect(result).toHaveLength(3) // 'bardzo' + 'najbardziej' (own paradigm) + 'lepiej' (fallback)
  })

  it('without a warmed paradigm shard for the similar word, the fallback yields nothing extra (documented, no throw)', () => {
    // No stubContentFetch / loadParadigmShard call -- resolvedParadigmShards is empty, so the
    // fallback in `collectSameSlotFormsFromSimilarWords` finds no already-resolved paradigms.
    const result = pickFormDistractors(BARDZO_PARADIGM, 'adv:degree:comparative', 3, 4)
    expect(result).not.toContain('bardziej')
    expect(result.length).toBe(2) // just the paradigm's own 'bardzo' + 'najbardziej'
  })
})
