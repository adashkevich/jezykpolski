/**
 * `enumerateSkills` — the set of all *possible* skills for a word
 * (`spec/tasks/03-domain-model.md` step 3, `spec/architecture.md` §5.2).
 *
 * This is the denominator for every percentage the UI shows (architecture.md §5.2/§5.4):
 * "how many slots does this word have" comes from the content, not from what happens to be
 * sitting in the `skills` table — lazy materialization means most of these descriptors will
 * never get a matching `SkillRecord` at all. `enumerateSkills` never touches storage; it is
 * a pure function of the decoded content for one word.
 *
 * Slot-construction rules (verified against real `public/content/paradigms/**` data — see
 * this task's decision log for the exact rows inspected):
 *
 *  - `vocab:pl-ru` / `vocab:ru-pl` always exist, paradigm or not.
 *  - NOUN: `noun:<sg|pl>:<case>`, one skill per (number, case) pair. Deliberately excludes
 *    `gender` from the key even though a handful of NOUN paradigms (~202, task 02 §6) carry
 *    forms tagged with more than one `gender` — such a form simply becomes an *extra
 *    accepted answer* on the same (number, case) skill, via the same "several valid forms
 *    -> one skill" mechanism used for genuine spelling alternations (e.g. plural genitive
 *    `aborcji` / `aborcyj` on `aborcja|NOUN` — confirmed in the real data at `noun:pl:genitive`,
 *    not `sg` as a shorthand illustration might suggest).
 *  - VERB: mood `infinitive` is skipped — the bare infinitive form is the lemma itself,
 *    already covered by the vocab skills; giving it its own dimension (there is no
 *    `verb:infinitive` entry in architecture.md §5.1's namespace) would just duplicate
 *    vocab practice. `imperative` -> `verb:imperative:<person>:<sg|pl>`. Indicative `past`
 *    -> `verb:past:<person>:<sg|pl>:<gender>` (gender is a real, non-aggregate distinction
 *    here: Polish past tense marks masculine/feminine/neuter in singular and
 *    masculine_personal/non_masculine_personal in plural — both are terminal values for
 *    VERB, never expanded via the ADJ aggregate breakdown). Indicative `present`/`future`
 *    -> `verb:<tense>:<person>:<sg|pl>` (covers analytic imperfective futures like
 *    "będę robić" — `analytic` only affects answer grading later, not the dimension).
 *  - ADJ: `degree: positive` forms -> `adj:<sg|pl>:<gender>:<case>`, with any aggregate
 *    `gender` (`any`, `non_masculine_personal`, `masculine_animate_or_personal`,
 *    `masculine_or_neuter`) expanded into its concrete genders via
 *    `content/codec.ts`'s `ADJ_GENDER_AGGREGATE_EXPANSION` (task 02's breakdown, reused
 *    here rather than re-implemented). `degree: comparative | superlative` forms -> only
 *    the citation slot (singular, nominative, bare `masculine`) feeds `adj:degree:<degree>`
 *    — matching the "dobry -> lepszy / najlepszy" example in `spec/app-design.md` §14. The
 *    fully-declined comparative/superlative forms that also exist in the data
 *    (e.g. `lepszej`, `najlepszego`) are intentionally not turned into skills: folding them
 *    into the same `adj:<number>:<gender>:<case>` dimension as the positive-degree form
 *    would wrongly present three different meanings as "alternate answers" to one question.
 *  - ADV: `degree: positive` is skipped (== the lemma, already vocab). `comparative` /
 *    `superlative` -> `adv:degree:<degree>`.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import {
  ADJ_GENDER_AGGREGATE_EXPANSION,
  isAdjGenderAggregate,
  type DecodedForm,
} from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { SkillKind } from '@/types/progress.ts'
import { abbreviateNumber, type Dimension } from './dimensions.ts'
import { encodeSkillId, encodeWordId, type SkillId, type WordId } from './skill-id.ts'

export interface SkillDescriptor {
  readonly skillId: SkillId
  readonly wordId: WordId
  readonly kind: SkillKind
  readonly dimension: Dimension
  /**
   * Every valid literal answer for this slot in the practiced language (Polish). More than
   * one entry means the slot has genuine free variation (e.g. `aborcji` / `aborcyj`) — this
   * is one skill, graded against any of them. Always empty for `vocab:*` skills: the
   * translation list lives in the senses shard (content layer, task 04) and is resolved at
   * exercise-generation time (task 09), not here.
   */
  readonly acceptedAnswers: readonly string[]
}

function kindOfDimension(dimension: Dimension): SkillKind {
  const separatorIndex = dimension.indexOf(':')
  const prefix = separatorIndex === -1 ? dimension : dimension.slice(0, separatorIndex)
  return prefix as SkillKind
}

/** Dimension string(s) one decoded form belongs to — zero (not a taught slot), one, or
 *  several (an ADJ aggregate-gender form fans out into each concrete gender it stands for). */
function dimensionsForForm(pos: WordIndexEntry['pos'], form: DecodedForm): Dimension[] {
  switch (pos) {
    case 'NOUN': {
      const { number, case: caseValue } = form
      if (!number || !caseValue) return []
      return [`noun:${abbreviateNumber(number)}:${caseValue}`]
    }

    case 'VERB': {
      if (form.mood === 'infinitive') return []

      if (form.mood === 'imperative') {
        const { person, number } = form
        if (!person || !number) return []
        return [`verb:imperative:${person}:${abbreviateNumber(number)}`]
      }

      if (form.mood === 'indicative') {
        if (form.tense === 'past') {
          const { person, number, gender } = form
          if (!person || !number || !gender) return []
          return [`verb:past:${person}:${abbreviateNumber(number)}:${gender}`]
        }
        if (form.tense === 'present' || form.tense === 'future') {
          const { person, number, tense } = form
          if (!person || !number) return []
          return [`verb:${tense}:${person}:${abbreviateNumber(number)}`]
        }
      }

      return []
    }

    case 'ADJ': {
      if (form.degree === 'positive') {
        const { number, case: caseValue, gender } = form
        if (!number || !caseValue || !gender) return []
        const concreteGenders = isAdjGenderAggregate(gender)
          ? ADJ_GENDER_AGGREGATE_EXPANSION[gender]
          : [gender]
        const numberAbbrev = abbreviateNumber(number)
        // `ADJ_GENDER_AGGREGATE_EXPANSION`'s declared value type is the broader `GenderValue[]`
        // (codec.ts has no reason to narrow it), even though every entry is in fact concrete —
        // verified by task 02's own tests (`isAdjGenderAggregate` is false for every expansion
        // member). Hence the cast, not a widening of `Dimension` itself.
        return concreteGenders.map((g) => `adj:${numberAbbrev}:${g}:${caseValue}` as Dimension)
      }

      if (form.degree === 'comparative' || form.degree === 'superlative') {
        const isCitationSlot =
          form.number === 'singular' && form.case === 'nominative' && form.gender === 'masculine'
        return isCitationSlot ? [`adj:degree:${form.degree}`] : []
      }

      return []
    }

    case 'ADV': {
      if (form.degree === 'comparative' || form.degree === 'superlative') {
        return [`adv:degree:${form.degree}`]
      }
      return []
    }
  }
}

export function enumerateSkills(word: WordIndexEntry, paradigm?: Paradigm): SkillDescriptor[] {
  const wordId = encodeWordId(word.lemma, word.pos)

  const skills: SkillDescriptor[] = [
    {
      skillId: encodeSkillId(wordId, 'vocab:pl-ru'),
      wordId,
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      acceptedAnswers: [],
    },
    {
      skillId: encodeSkillId(wordId, 'vocab:ru-pl'),
      wordId,
      kind: 'vocab',
      dimension: 'vocab:ru-pl',
      acceptedAnswers: [],
    },
  ]

  if (!paradigm) return skills

  // dimension -> accepted answers, in first-seen order, de-duplicated.
  const answersByDimension = new Map<Dimension, string[]>()
  for (const form of paradigm.forms) {
    for (const dimension of dimensionsForForm(word.pos, form)) {
      const answers = answersByDimension.get(dimension)
      if (answers === undefined) {
        answersByDimension.set(dimension, [form.form])
      } else if (!answers.includes(form.form)) {
        answers.push(form.form)
      }
    }
  }

  for (const [dimension, acceptedAnswers] of answersByDimension) {
    skills.push({
      skillId: encodeSkillId(wordId, dimension),
      wordId,
      kind: kindOfDimension(dimension),
      dimension,
      acceptedAnswers,
    })
  }

  return skills
}
