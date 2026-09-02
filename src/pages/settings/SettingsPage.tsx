/**
 * `/settings` (`spec/tasks/24-settings-backup.md`, `spec/requirements.md` FR-130…FR-135).
 * Real screen, replacing task 06's stub — four blocks in the task text's own order:
 * "Обучение" / "Интерфейс" / "Данные" / "О приложении", each its own component in
 * `features/settings/components/**` so this file stays a pure composition root.
 */
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { LearningSettingsSection } from '@/features/settings/components/LearningSettingsSection.tsx'
import { InterfaceSettingsSection } from '@/features/settings/components/InterfaceSettingsSection.tsx'
import { DataSection } from '@/features/settings/components/DataSection.tsx'
import { AboutSection } from '@/features/settings/components/AboutSection.tsx'

export function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Настройки" />
      <LearningSettingsSection />
      <InterfaceSettingsSection />
      <DataSection />
      <AboutSection />
    </PageContainer>
  )
}

export default SettingsPage
