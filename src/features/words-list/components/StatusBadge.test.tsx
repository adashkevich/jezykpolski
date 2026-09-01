/**
 * NFR-11: "не только цветом" — every status must be distinguishable without color. This
 * asserts each status renders a distinct text label (queryable regardless of any CSS/color)
 * and a distinct icon (a different `lucide-react` SVG class per status, so two statuses
 * never share the exact same non-text signal either).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge.tsx'
import type { WordStatus } from '@/types/progress.ts'

afterEach(() => {
  cleanup()
})

const CASES: ReadonlyArray<{ status: WordStatus; label: string }> = [
  { status: 'new', label: 'Новое' },
  { status: 'learning', label: 'Изучаю' },
  { status: 'known', label: 'Знаю' },
  { status: 'mastered', label: 'Освоено' },
]

describe('StatusBadge', () => {
  it.each(CASES)('renders the "$label" text label for status "$status"', ({ status, label }) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('every status uses a distinct icon shape, not just a distinct color', () => {
    const iconClasses = CASES.map(({ status }) => {
      const { container, unmount } = render(<StatusBadge status={status} />)
      const svg = container.querySelector('svg')
      const lucideClass = [...(svg?.classList ?? [])].find(
        (c) => c.startsWith('lucide-') && c !== 'lucide',
      )
      unmount()
      return lucideClass
    })
    expect(new Set(iconClasses).size).toBe(CASES.length)
  })

  it('the icon is decorative (aria-hidden) so the text label is the accessible content', () => {
    render(<StatusBadge status="known" />)
    const svg = document.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
