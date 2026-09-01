import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { PosSwitcher } from './PosSwitcher.tsx'

/** Stub — the virtualized, filterable word list (FR-20…FR-2x) is a later task. */
export function WordsListPage() {
  return (
    <PageContainer>
      <PageHeader title="Слова" description="Список всех лемм — задача 07+." />
      <PosSwitcher />
    </PageContainer>
  )
}

export default WordsListPage
