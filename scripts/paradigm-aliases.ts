/**
 * Which paradigm of `data/inflections.json` a word of the v2 dictionary uses
 * (`spec/tasks/47-content-pipeline-v2.md` §3).
 *
 * `inflections.json` is still keyed by the v1 `wordId`s, and 37 words changed their `wordId` in
 * v2 (`data/word-id-renames.json`, task 46). A word resolves, in this order:
 *  1. by an explicit {@link PARADIGM_OVERRIDES} entry — a paradigm id, or `null` for none;
 *  2. to no paradigm when its POS is in {@link POS_WITHOUT_PARADIGM};
 *  3. under its own `wordId`;
 *  4. under the v1 `wordId` that the rename map maps to it (e.g. `spocić się|VERB` ->
 *     `spocić|VERB`: reflexive verbs conjugate exactly like the base verb, and the form
 *     exercises never introduce `się`).
 *
 * The exceptions are an explicit table here, not logic in `build-content.ts`.
 */
import type { PosValue } from '../src/content/codec.ts'

export const PARADIGM_OVERRIDES: Readonly<Record<string, string | null>> = {
  // The rename map points back at `wpatrować|VERB`, the v1 lemma — a different verb. The
  // right paradigm is already in inflections.json under `wpatrywać|VERB`.
  'wpatrywać się|VERB': 'wpatrywać|VERB',
  // The v1 `piast|NOUN` is the Gen.pl form, not a lemma: its "paradigm" is not piasta's.
  'piasta|NOUN': null,
}

/**
 * The v1 "paradigms" of pronouns, `gdy` and `dzięki` (`co|NOUN`, `to|NOUN`, …) are 6–8 case
 * forms tagged as a noun; teaching them as noun declension is wrong. Vocab skills only.
 */
export const POS_WITHOUT_PARADIGM: readonly PosValue[] = ['PRON', 'SCONJ', 'INTJ']

export type ParadigmVia = 'direct' | 'rename' | 'override' | 'pos' | 'missing'

export interface ParadigmResolution {
  /** Key into `inflections.json`'s `paradigms`, or `null` when the word has none. */
  readonly paradigmId: string | null
  readonly via: ParadigmVia
}

export type ParadigmResolver = (wordId: string, pos: PosValue) => ParadigmResolution

/**
 * @param paradigmIds every key of `inflections.json`'s `paradigms`
 * @param renames `data/word-id-renames.json`'s `renames` (v1 `wordId` -> v2 `wordId`)
 * @throws when an override names a paradigm that does not exist, or two v1 paradigms could
 *   serve the same v2 word (add an override to pick one)
 */
export function createParadigmResolver(
  paradigmIds: ReadonlySet<string>,
  renames: Readonly<Record<string, string>>,
): ParadigmResolver {
  for (const [wordId, paradigmId] of Object.entries(PARADIGM_OVERRIDES)) {
    if (paradigmId !== null && !paradigmIds.has(paradigmId)) {
      throw new Error(`paradigm-aliases: override ${wordId} -> ${paradigmId}: no such paradigm`)
    }
  }

  const renamedFrom = new Map<string, string>()
  for (const [from, to] of Object.entries(renames)) {
    if (!paradigmIds.has(from)) continue
    const other = renamedFrom.get(to)
    if (other !== undefined && !Object.hasOwn(PARADIGM_OVERRIDES, to)) {
      throw new Error(
        `paradigm-aliases: both ${other} and ${from} were renamed to ${to}; add an override`,
      )
    }
    renamedFrom.set(to, from)
  }

  return (wordId, pos) => {
    if (Object.hasOwn(PARADIGM_OVERRIDES, wordId)) {
      return { paradigmId: PARADIGM_OVERRIDES[wordId] ?? null, via: 'override' }
    }
    if (POS_WITHOUT_PARADIGM.includes(pos)) return { paradigmId: null, via: 'pos' }
    if (paradigmIds.has(wordId)) return { paradigmId: wordId, via: 'direct' }
    const from = renamedFrom.get(wordId)
    if (from !== undefined) return { paradigmId: from, via: 'rename' }
    return { paradigmId: null, via: 'missing' }
  }
}
