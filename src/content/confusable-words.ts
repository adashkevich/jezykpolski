/**
 * `CONFUSABLE_GROUPS` (`spec/tasks/27-context-and-error-analysis.md` §3, FR-94).
 *
 * Exactly the 10 groups the supervisor specified verbatim — this file does not add,
 * remove, or reword any group's *semantic* content. What it DOES do, per the supervisor's
 * own explicit instruction ("не все леммы обязательно есть в реальном корпусе... напиши
 * скрипт/тест, который резолвит каждую лемму... и логируй любую, которая не нашлась — такую
 * группу просто исключи"): resolve every lemma against the real shipped corpus
 * (`public/content/index.json`, verified via a one-off `node -e` query against the checked-in
 * file, and re-verified by `confusable-words.test.ts`'s hand-copied real-data fixture — same
 * "no `node:fs` in `src/**` test files" convention `learning/exercises/distractors.test.ts`'s
 * own header documents, since this package's `tsconfig.app.json` has no Node ambients and a
 * live `readFileSync` here would break `tsc -b`), and drop any group with an unresolved
 * member rather than guess an alternate spelling.
 *
 * -----------------------------------------------------------------------------------------
 * RESOLUTION LOG (one-off `node -e` check against `public/content/index.json`, all 10
 * candidate groups, POS assigned per the supervisor's own instruction — first 7 groups
 * VERB, last 3 ADJ):
 *
 *   wiedzieć|VERB        OK
 *   znać|VERB            OK
 *   myśleć|VERB          OK
 *   rozumieć|VERB        OK
 *   mówić|VERB           OK
 *   rozmawiać|VERB       OK
 *   widzieć|VERB         OK
 *   patrzeć|VERB         OK
 *   słyszeć|VERB         OK
 *   słuchać|VERB         OK
 *   uczyć się|VERB       MISSING — the corpus indexes the reflexive verb as `uczyć|VERB`
 *                        (no `się` in the lemma column). Per the supervisor's explicit
 *                        instruction not to guess an alternate spelling, the WHOLE
 *                        `['uczyć się', 'studiować']` group is EXCLUDED below, not silently
 *                        rewritten to `['uczyć', 'studiować']` (that would associate a
 *                        different, non-reflexive verb's exercises with this group without
 *                        the supervisor having actually reviewed that substitution).
 *   studiować|VERB       OK (its sibling `uczyć się` is missing, so this lemma simply never
 *                        appears in any exported group either — a group needs 2 members).
 *   chcieć|VERB          OK
 *   lubić|VERB           OK
 *   duży|ADJ             OK
 *   wielki|ADJ           OK
 *   mały|ADJ             OK
 *   niewielki|ADJ        OK
 *   ładny|ADJ            OK
 *   piękny|ADJ           OK
 *
 * Net result: 9 of the 10 candidate groups ship; `['uczyć się', 'studiować']` does not.
 * -----------------------------------------------------------------------------------------
 */

export const CONFUSABLE_GROUPS: readonly (readonly string[])[] = [
  ['wiedzieć', 'znać'],
  ['myśleć', 'rozumieć'],
  ['mówić', 'rozmawiać'],
  ['widzieć', 'patrzeć'],
  ['słyszeć', 'słuchać'],
  ['chcieć', 'lubić'],
  ['duży', 'wielki'],
  ['mały', 'niewielki'],
  ['ładny', 'piękny'],
]
