/**
 * The three flags on the first-run language screen (`spec/tasks/52-language-onboarding.md` §2).
 *
 * Inline SVG, not flag emoji: the Belarus emoji is the red-green state flag and the screen
 * needs the white-red-white (БЧБ) one, and flag emoji don't render at all on Windows. All are
 * decorative (`aria-hidden`) — the language is written on the card next to the flag. The
 * `data-flag` / `data-stripe` hooks are for the tests; every flag gets a hairline ring so the
 * white stripes still read against the white card.
 */
import { cn } from '@/lib/utils'

interface FlagProps {
  readonly className?: string
}

const FLAG_CLASS = 'h-8 w-12 shrink-0 rounded-md ring-1 ring-foreground/15'

/** Russia as the product draws it: white / blue / white, three equal horizontal stripes (the
 *  bottom one white, not the state flag's red). */
export function FlagRu({ className }: FlagProps) {
  return (
    <svg
      data-flag="ru"
      viewBox="0 0 3 2"
      aria-hidden="true"
      focusable="false"
      className={cn(FLAG_CLASS, className)}
    >
      <rect data-stripe width="3" height="0.667" y="0" fill="#ffffff" />
      <rect data-stripe width="3" height="0.667" y="0.667" fill="#0039a6" />
      <rect data-stripe width="3" height="0.667" y="1.333" fill="#ffffff" />
    </svg>
  )
}

/** Belarus, the historical БЧБ: white / red / white, three equal horizontal stripes. */
export function FlagBcb({ className }: FlagProps) {
  return (
    <svg
      data-flag="bcb"
      viewBox="0 0 3 2"
      aria-hidden="true"
      focusable="false"
      className={cn(FLAG_CLASS, className)}
    >
      <rect data-stripe width="3" height="0.667" y="0" fill="#ffffff" />
      <rect data-stripe width="3" height="0.667" y="0.667" fill="#cf101a" />
      <rect data-stripe width="3" height="0.667" y="1.333" fill="#ffffff" />
    </svg>
  )
}

/** Ukraine: blue over yellow, two equal horizontal stripes. */
export function FlagUa({ className }: FlagProps) {
  return (
    <svg
      data-flag="ua"
      viewBox="0 0 3 2"
      aria-hidden="true"
      focusable="false"
      className={cn(FLAG_CLASS, className)}
    >
      <rect data-stripe width="3" height="1" y="0" fill="#0057b7" />
      <rect data-stripe width="3" height="1" y="1" fill="#ffd700" />
    </svg>
  )
}
