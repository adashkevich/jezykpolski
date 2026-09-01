import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { PosSwitcher } from '@/pages/words/PosSwitcher.tsx'

/** Stub — the adjective-specific view (declension/agreement) is a later task. */
export function AdjectivesListPage() {
  return (
    <PageContainer>
      <PageHeader title="Прилагательные" description="Склонение — задача 07+." />
      <PosSwitcher />
    </PageContainer>
  )
}

export default AdjectivesListPage
