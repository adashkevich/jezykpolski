/**
 * `matching` exercise UI — "Сопоставление" (`spec/tasks/27-context-and-error-analysis.md`
 * §4, FR-55): tap a Polish word, then tap its Russian translation, to form a pair. Two
 * shuffled columns (PL left, RU right); a correct pair locks both tiles green and is reported
 * at once via `onPairMatched` (graded there — `useMatchingPracticeSession.ts#gradePair`); a
 * wrong pair briefly flashes red on both tiles (icon + color, NFR-11) and deselects without
 * being graded itself (see that hook's own header for why). Large tap targets throughout
 * (`min-h-14`, wider than the usual `min-h-11` — these tiles carry a whole word, not a single
 * digit/icon).
 *
 * Task 44 (`spec/tasks/44-matching-credit-all-but-mistaken.md`, FR-55): a wrong pair taints
 * BOTH its words (the PL tile's and the RU tile's `wordId`) — `taintedRef` below is a set
 * kept for the whole batch, so a repeated mistake on an already tainted word changes nothing. A
 * later correct pair for a tainted word is still locked green on screen, but is reported with
 * `graded: false` (`lexical-batch.ts#shouldGradeMatch`) so the caller writes nothing for it.
 * This is the single place the rule is applied; both consumers (`/practice/matching` and the
 * daily session's `SessionMatchingBlock`) just honour the flag.
 */
import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { shouldGradeMatch } from '@/learning/practice/lexical-batch.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { MatchingPairSource } from '../hooks/useMatchingPracticeSession.ts'

type TileStatus = 'idle' | 'selected' | 'matched' | 'wrong'

interface Tile {
  readonly wordId: WordId
  readonly text: string
}

/** Deterministic-enough shuffle for a UI list (not answer-grading, no seed determinism
 *  requirement here — every other `Math.random` shuffle in this app's UI-only, non-graded
 *  code, e.g. `MatchingExercise`'s own column order, is fine using the platform RNG). */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/** Second argument of `onPairMatched` — `graded: false` for a word tainted by an earlier wrong
 *  pairing (task 44): the pair is still matched on screen, but the caller must not grade it. */
export interface MatchedPairInfo {
  readonly graded: boolean
}

export interface MatchingExerciseProps {
  readonly pairs: readonly MatchingPairSource[]
  onPairMatched(wordId: WordId, info: MatchedPairInfo): void | Promise<void>
  /** All pairs matched — the caller closes out the session and navigates away. */
  onDone(): void
}

export function MatchingExercise({ pairs, onPairMatched, onDone }: MatchingExerciseProps) {
  const plTiles = useMemo<Tile[]>(
    () => shuffled(pairs.map((p) => ({ wordId: p.wordId, text: p.pl }))),
    [pairs],
  )
  const ruTiles = useMemo<Tile[]>(
    () => shuffled(pairs.map((p) => ({ wordId: p.wordId, text: p.ru }))),
    [pairs],
  )

  const [selectedPl, setSelectedPl] = useState<WordId | null>(null)
  const [selectedRu, setSelectedRu] = useState<WordId | null>(null)
  const [matched, setMatched] = useState<ReadonlySet<WordId>>(new Set())
  const [wrongFlash, setWrongFlash] = useState<{ pl: WordId; ru: WordId } | null>(null)
  // Words whose PL or RU tile ever took part in a wrong pair (task 44) — a ref, not state: it
  // is only read when a correct pair is reported, never during render.
  const taintedRef = useRef<Set<WordId>>(new Set())

  const allMatched = matched.size === pairs.length

  useEffect(() => {
    if (!wrongFlash) return
    const timer = setTimeout(() => {
      setWrongFlash(null)
      setSelectedPl(null)
      setSelectedRu(null)
    }, 500)
    return () => clearTimeout(timer)
  }, [wrongFlash])

  function statusOfPl(wordId: WordId): TileStatus {
    if (matched.has(wordId)) return 'matched'
    if (wrongFlash?.pl === wordId) return 'wrong'
    if (selectedPl === wordId) return 'selected'
    return 'idle'
  }

  function statusOfRu(wordId: WordId): TileStatus {
    if (matched.has(wordId)) return 'matched'
    if (wrongFlash?.ru === wordId) return 'wrong'
    if (selectedRu === wordId) return 'selected'
    return 'idle'
  }

  function tryMatch(plWordId: WordId | null, ruWordId: WordId | null) {
    if (plWordId === null || ruWordId === null) return
    if (plWordId === ruWordId) {
      setMatched((prev) => new Set(prev).add(plWordId))
      setSelectedPl(null)
      setSelectedRu(null)
      void onPairMatched(plWordId, { graded: shouldGradeMatch(plWordId, taintedRef.current) })
    } else {
      taintedRef.current.add(plWordId)
      taintedRef.current.add(ruWordId)
      setWrongFlash({ pl: plWordId, ru: ruWordId })
    }
  }

  function pickPl(wordId: WordId) {
    if (matched.has(wordId) || wrongFlash) return
    if (selectedPl === wordId) {
      setSelectedPl(null)
      return
    }
    setSelectedPl(wordId)
    tryMatch(wordId, selectedRu)
  }

  function pickRu(wordId: WordId) {
    if (matched.has(wordId) || wrongFlash) return
    if (selectedRu === wordId) {
      setSelectedRu(null)
      return
    }
    setSelectedRu(wordId)
    tryMatch(selectedPl, wordId)
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Сопоставлено {matched.size} из {pairs.length}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {plTiles.map((tile) => (
            <MatchingTile
              key={tile.wordId}
              tile={tile}
              status={statusOfPl(tile.wordId)}
              onClick={() => pickPl(tile.wordId)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {ruTiles.map((tile) => (
            <MatchingTile
              key={tile.wordId}
              tile={tile}
              status={statusOfRu(tile.wordId)}
              onClick={() => pickRu(tile.wordId)}
            />
          ))}
        </div>
      </div>

      {allMatched && (
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground"
        >
          Готово
        </button>
      )}
    </div>
  )
}

function MatchingTile({
  tile,
  status,
  onClick,
}: {
  readonly tile: Tile
  readonly status: TileStatus
  onClick(): void
}) {
  const locked = status === 'matched'
  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={status === 'selected'}
      onClick={onClick}
      className={cn(
        'flex min-h-14 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-base outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
        status === 'idle' && 'border-border bg-background hover:bg-muted',
        status === 'selected' && 'border-ring bg-muted',
        status === 'matched' && 'border-success bg-success/10 text-success',
        status === 'wrong' && 'border-error bg-error/10 text-error',
      )}
    >
      <span className="flex-1">{tile.text}</span>
      {status === 'matched' && <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />}
      {status === 'wrong' && <XCircle aria-hidden="true" className="size-5 shrink-0" />}
    </button>
  )
}
