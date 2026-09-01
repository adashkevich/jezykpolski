import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { PosSwitcher } from '@/pages/words/PosSwitcher.tsx'

/** Stub — the noun-specific view (cases, number, gender — FR-02) is a later task. */
export function NounsListPage() {
  return (
    <PageContainer>
      <PageHeader title="Существительные" description="Падежи, число, род — задача 07+." />
      <PosSwitcher />
    </PageContainer>
  )
}

export default NounsListPage
