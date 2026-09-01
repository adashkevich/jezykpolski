import { Link, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * Part-of-speech switcher shown at the top of the "Слова" section
 * (`architecture.md` §9: "Разделы «Сущ. / Глаголы / Прил.» открываются из «Слова»
 * переключателем POS — это устраняет дублирование четырёх почти одинаковых экранов
 * списка"). Navigates between the four sibling list routes; it is NOT bottom-nav tabs.
 *
 * Pure routing/layout — the actual filtered word lists are later tasks' job.
 */
const SECTIONS = [
  { to: '/words', label: 'Все' },
  { to: '/nouns', label: 'Сущ.' },
  { to: '/verbs', label: 'Глаголы' },
  { to: '/adjectives', label: 'Прил.' },
] as const

export function PosSwitcher() {
  const { pathname } = useLocation()

  return (
    <nav aria-label="Часть речи" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {SECTIONS.map((section) => {
        const active = pathname === section.to
        return (
          <Link
            key={section.to}
            to={section.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
