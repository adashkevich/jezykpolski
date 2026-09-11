/** Russian plural-form picker (`count % 10` / `% 100` rule) — same shape as
 *  `ResumeSessionPrompt.tsx#pluralizeItem`, generalized to 3 forms so callers can inflect
 *  several different words/predicates instead of hardcoding one. */
export function pluralize(count: number, forms: readonly [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}
