import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'

/** Stub — real content (due-count, "Продолжить обучение" CTA, FR-10/FR-11) is a later task. */
export function HomePage() {
  return (
    <PageContainer>
      <PageHeader title="Главная" description="Сводка и запуск сессии — задача 07+." />
    </PageContainer>
  )
}

export default HomePage
