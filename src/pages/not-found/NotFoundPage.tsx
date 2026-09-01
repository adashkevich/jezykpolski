import { Link } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { Button } from '@/components/ui/button.tsx'

/**
 * Catch-all for unknown paths. Not listed in `architecture.md` §9's route table, but a
 * dedicated route/error decision — a decision left to this task; not required by acceptance,
 * but needed so an SPA-fallback 404 (e.g. an offline direct hit on a stale/typoed URL) shows
 * a real screen instead of silently rendering nothing.
 */
export function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState
        title="Страница не найдена"
        description="Такого адреса нет в приложении."
        action={
          <Button asChild className="min-h-11 px-6">
            <Link to="/">На главную</Link>
          </Button>
        }
      />
    </PageContainer>
  )
}

export default NotFoundPage
