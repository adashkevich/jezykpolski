import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'

/** Stub — theme toggle, prefetch/storage settings, etc. are later tasks (24, 25). */
export function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Настройки" description="Тема, офлайн-режим — задача 24+." />
    </PageContainer>
  )
}

export default SettingsPage
