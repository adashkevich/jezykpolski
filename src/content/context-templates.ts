/**
 * Context-sentence templates (`spec/tasks/27-context-and-error-analysis.md` §2, FR-63).
 *
 * The open architectural question that task's own text leaves unresolved ("источник
 * предложений") is settled by the supervisor, not invented here: per-word authored
 * sentences are not attempted (unaffordable by hand for the whole corpus); instead this is
 * a small, fixed bank of 8 semantically-neutral templates, 2 per case, covering exactly the
 * 4 cases whose government is genuinely hard for a learner to internalize from a bare
 * "Genitive" label — genitive/dative/instrumental/locative (nominative/accusative are
 * already the two "default" cases every other exercise already drills via the lemma itself
 * and the `form-choice` recognition step; vocative is excluded entirely, see
 * `learning/skills/dimensions.ts`'s own `CASE_VALUES` — it never gets a `noun:sg:vocative`
 * skill in the first place, `enumerate.ts` never emits one).
 *
 * "Semantically neutral" is what makes ONE template usable for ANY noun without a
 * per-word correctness check: every template is a 1st-person-singular present-tense
 * sentence whose grammatical government of the blank is fixed by the verb/preposition
 * alone, independent of the target word's own gender/animacy/meaning — swapping in any
 * singular noun's correctly-declined form for that case always yields a grammatical
 * sentence (even if a handful of resulting sentences read as semantically odd, e.g. "Szukam
 * poniedziałku" — grammatically correct, mildly unusual meaning; acceptable for a drill
 * whose entire point is the case ending, not narrative sense).
 *
 * Singular only (task decision, recorded here per the task text's own instruction to
 * document deviations): plural noun forms are a separate, out-of-scope extension — nothing
 * below is ever looked up for a `noun:pl:*` dimension (`picker.ts`'s own eligibility check
 * only matches `noun:sg:*`).
 *
 * Exactly these 8 strings, verbatim, per the supervisor's explicit instruction not to
 * invent or rephrase any of them.
 */

export type ContextTemplateCase = 'genitive' | 'dative' | 'instrumental' | 'locative'

export const CONTEXT_TEMPLATES: Readonly<Record<ContextTemplateCase, readonly string[]>> = {
  genitive: ['Nie ma ___.', 'Szukam ___.'],
  dative: ['Przyglądam się ___.', 'Dziękuję ___.'],
  instrumental: ['Interesuję się ___.', 'Rozmawiam z ___.'],
  locative: ['Myślę o ___.', 'Rozmawiamy o ___.'],
}
