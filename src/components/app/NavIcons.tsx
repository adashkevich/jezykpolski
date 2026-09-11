import type { ReactElement, ReactNode } from 'react'

/**
 * Bottom-tab glyphs drawn to match `spec/design/*.png` (Material Symbols shapes, which lucide
 * has no close equivalents for: a house with a cut-out door, a book with ruled right page, a
 * level two-plate dumbbell, a boxed bar chart). Inactive tabs are outlined; the book and the
 * chart switch to their filled variant when active, with the inner details knocked out in the
 * card color — home and dumbbell stay outlined in the mockups' active state too.
 */
export interface NavIconProps {
  readonly active: boolean
  readonly className?: string
}

export type NavIcon = (props: NavIconProps) => ReactElement

function Glyph({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export const HomeIcon: NavIcon = ({ className }) => (
  <Glyph className={className}>
    <path d="M4.5 20V9.75L12 4l7.5 5.75V20h-5v-6h-5v6z" />
  </Glyph>
)

export const BookIcon: NavIcon = ({ active, className }) => (
  <Glyph className={className}>
    <path
      d="M12 6.5C10.5 5.3 8.3 4.75 6.25 4.75c-1.5 0-3 .3-4.25.9V19c1.25-.55 2.75-.85 4.25-.85 2.05 0 4.25.55 5.75 1.75 1.5-1.2 3.7-1.75 5.75-1.75 1.5 0 3 .3 4.25.85V5.65c-1.25-.6-2.75-.9-4.25-.9-2.05 0-4.25.55-5.75 1.75z"
      fill={active ? 'currentColor' : 'none'}
    />
    <path
      d="M12 6.5v13.4M14.75 9.25h4.5M14.75 12h4.5M14.75 14.75h4.5"
      className={active ? 'stroke-card' : undefined}
      strokeWidth={active ? 1.5 : 2}
    />
  </Glyph>
)

export const DumbbellIcon: NavIcon = ({ className }) => (
  <Glyph className={className}>
    <rect x="3" y="8" width="4.5" height="8" rx="1.5" />
    <rect x="16.5" y="8" width="4.5" height="8" rx="1.5" />
    <path d="M7.5 12h9" />
  </Glyph>
)

export const ChartIcon: NavIcon = ({ active, className }) => (
  <Glyph className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" fill={active ? 'currentColor' : 'none'} />
    <path d="M8 16.5v-5M12 16.5v-9M16 16.5v-3" className={active ? 'stroke-card' : undefined} />
  </Glyph>
)
