import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'

/** Stub — progress/statistics aggregation is a later task. */
export function StatsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Прогресс"
        description="Статистика по уровням и частям речи — задача 07+."
      />
    </PageContainer>
  )
}

export default StatsPage
