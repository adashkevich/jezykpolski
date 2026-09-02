/**
 * Deterministic numeric seed for `generateExercise(..., seed)` (`@/learning/exercises/generate.ts`,
 * task 09) — task 10 §3: "Seed = хэш от skillId + reps". `generate.ts` needs a plain
 * `number`, not a string, and needs it to change (so a re-shown question after a wrong
 * answer/requeue isn't byte-identical, task text §4 "демпфирование при повторе") whenever
 * the same skill is asked again within one session — hence `attempt` as the thing that
 * varies, not wall-clock or `Math.random()` (would break `generateExercise`'s own
 * determinism contract).
 *
 * FNV-1a, 32-bit — a small, well-known, dependency-free string hash; cryptographic strength
 * is irrelevant here, only "different inputs almost always produce different outputs" and
 * "the same input always produces the same output" matter.
 */
export function seedFor(skillId: string, attempt: number): number {
  const input = `${skillId}::${attempt}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
