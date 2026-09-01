/**
 * `/words/:wordId` URL encoding (`spec/tasks/06-app-shell-pwa.md` §1, `architecture.md` §9).
 *
 * `WordId` (`learning/skills/skill-id.ts`) is `"<lemma>|<POS>"`, e.g. `"kobieta|NOUN"`. The
 * `|` is not a valid path character, so every route that links to or reads a word detail page
 * must go through `wordPath()` / `parseWordParam()` rather than hand-rolling
 * `encodeURIComponent`/`decodeURIComponent` calls at each call site — exactly the kind of
 * "encoding smeared across components" the task text warns against.
 *
 * Split into its own (non-component) module, same reasoning as `content-context.ts`: these
 * are plain functions, and `router.tsx` (which imports this) also exports route/JSX
 * components, so co-locating them there would trip
 * `react-refresh/only-export-components`.
 */
import type { WordId } from '@/learning/skills/skill-id.ts'

/** Builds the `/words/:wordId` path for a given `WordId`, URL-encoding it. */
export function wordPath(wordId: WordId): string {
  return `/words/${encodeURIComponent(wordId)}`
}

/** Decodes a raw `:wordId` route param (as read from `useParams()`) back into a `WordId`.
 *  Only reverses the percent-encoding — it does not validate that the result is a
 *  well-formed `"<lemma>|<POS>"` string; callers that need that guarantee should decode it
 *  further with `decodeWordId()` (`learning/skills/skill-id.ts`). */
export function parseWordParam(param: string): WordId {
  return decodeURIComponent(param)
}
