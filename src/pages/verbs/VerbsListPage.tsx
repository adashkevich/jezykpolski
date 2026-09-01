import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { PosSwitcher } from '@/pages/words/PosSwitcher.tsx'

/** Stub — the verb-specific view (conjugation) is a later task. */
export function VerbsListPage() {
  return (
    <PageContainer>
      <PageHeader title="Глаголы" description="Спряжения — задача 07+." />
      <PosSwitcher />
    </PageContainer>
  )
}

export default VerbsListPage
