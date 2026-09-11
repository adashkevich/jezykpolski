import { Link, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { BookIcon, ChartIcon, DumbbellIcon, HomeIcon, type NavIcon } from './NavIcons.tsx'

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
  readonly icon: NavIcon
  readonly isActive: (pathname: string) => boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Главная', icon: HomeIcon, isActive: (p) => p === '/' },
  {
    to: '/words',
    label: 'Слова',
    icon: BookIcon,
    isActive: (p) =>
      p.startsWith('/words') ||
      p.startsWith('/nouns') ||
      p.startsWith('/verbs') ||
      p.startsWith('/adjectives'),
  },
  {
    to: '/practice',
    label: 'Практика',
    icon: DumbbellIcon,
    isActive: (p) => p.startsWith('/practice') || p.startsWith('/session'),
  },
  { to: '/stats', label: 'Прогресс', icon: ChartIcon, isActive: (p) => p.startsWith('/stats') },
]

export function BottomNavigation() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-20 bg-card shadow-[0_-1px_0_rgb(15_23_42/0.05),0_-4px_16px_rgb(15_23_42/0.03)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-screen-sm grid-cols-4 px-2 sm:px-4">
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
                  'flex min-h-16 flex-col items-center justify-center gap-1 py-2 text-label-md font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon active={active} className="size-6" />
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
