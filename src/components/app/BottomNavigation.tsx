import { BarChart3, BookOpen, Dumbbell, Home, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * Mobile bottom tab bar (`spec/tasks/06-app-shell-pwa.md` §2, `architecture.md` §9):
 * Главная · Слова · Практика · Прогресс. Settings deliberately has no tab here — it lives as
 * an icon button in `AppShell`'s top bar instead (task text, repeated in architecture.md §9).
 *
 * "Слова" also highlights on `/nouns`, `/verbs`, `/adjectives`, and any `/words/:wordId`
 * detail page: architecture.md §9 folds those three part-of-speech lists into a switcher
 * *inside* "Слова" rather than giving them their own tabs ("это устраняет дублирование
 * четырёх почти одинаковых экранов списка"), so all four routes are the same nav section as
 * far as the tab bar is concerned, even though they're still separate top-level routes.
 * "Практика" likewise covers `/session*` — a learn/practice run is reached from Practice (or
 * Home's "Продолжить обучение" CTA) and has no tab of its own.
 */
interface NavItem {
  readonly to: string
  readonly label: string
  readonly icon: LucideIcon
  readonly isActive: (pathname: string) => boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Главная', icon: Home, isActive: (p) => p === '/' },
  {
    to: '/words',
    label: 'Слова',
    icon: BookOpen,
    isActive: (p) =>
      p.startsWith('/words') ||
      p.startsWith('/nouns') ||
      p.startsWith('/verbs') ||
      p.startsWith('/adjectives'),
  },
  {
    to: '/practice',
    label: 'Практика',
    icon: Dumbbell,
    isActive: (p) => p.startsWith('/practice') || p.startsWith('/session'),
  },
  { to: '/stats', label: 'Прогресс', icon: BarChart3, isActive: (p) => p.startsWith('/stats') },
]

export function BottomNavigation() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-screen-sm grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname)
          const Icon = item.icon
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // min-h-11 (44px) keeps the touch target at/above the NFR-11 floor even
                  // though the column is already much wider than 44px on a 320px viewport.
                  'flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
