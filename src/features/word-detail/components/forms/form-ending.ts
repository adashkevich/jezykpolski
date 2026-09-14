/**
 * Splits an inflected NOUN form into a stem + ending for the declension list
 * (`spec/design/word-noun.png`: `osob` in the base color, `a` highlighted).
 *
 * A naive "longest common prefix across all forms" fails on ~27% of the corpus because Polish
 * stem alternation shifts consonants/vowels right at the stem boundary (`stopa` -> `stopy`
 * would give LCP `st`, not `stop`; `utwór` -> `utwory` gives `utw`, not `utwor`; `błąd` ->
 * `błędy` gives `bł`, not even close). Those are real forms, not noise — the fix is to stop
 * requiring EVERY form to share the prefix and instead take the longest prefix shared by a
 * strict majority of the distinct forms, which the alternating minority can't drag down.
 */

/** Longest prefix (>=2 chars) shared by a strict majority of the distinct forms. `''` when
 *  there's no majority prefix worth using (fewer than 2 distinct forms, or nothing survives). */
export function paradigmStem(forms: readonly string[]): string {
  const distinct = [...new Set(forms)]
  if (distinct.length < 2) return ''

  const maxLen = Math.max(...distinct.map((f) => f.length))
  for (let len = maxLen; len >= 2; len--) {
    const counts = new Map<string, number>()
    for (const form of distinct) {
      if (form.length < len) continue
      const prefix = form.slice(0, len)
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
    }
    for (const [prefix, count] of counts) {
      if (count * 2 > distinct.length) return prefix
    }
  }
  return ''
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a[i] === b[i]) i++
  return i
}

/** Splits `form` into `[stem, ending]` given the paradigm-wide stem from `paradigmStem`.
 *  Returns `[form, '']` (render the whole form plain, no highlight) whenever the split would
 *  be misleading: no usable stem, an ending longer than a real Polish inflectional ending
 *  should be, or a multi-word form (context phrases aren't single inflected words). Forms that
 *  soften by one letter right at the boundary (e.g. `gospodarka` stem `gospodar` -> `gospodarce`)
 *  are still split at the stem's own length, which reads correctly for those cases. */
export function splitEnding(form: string, stem: string): readonly [string, string] {
  if (stem === '' || form.includes(' ')) return [form, '']

  let cut = -1
  if (form.startsWith(stem)) {
    cut = stem.length
  } else {
    const shared = commonPrefixLength(stem, form)
    if (shared >= stem.length - 1 && shared >= 2) cut = shared
  }

  if (cut < 0 || cut >= form.length || form.length - cut > 5) return [form, '']
  return [form.slice(0, cut), form.slice(cut)]
}
