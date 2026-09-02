/**
 * "О приложении" block (`spec/tasks/24-settings-backup.md` §1, FR-135). `contentVersion` and
 * "Слов в базе" come straight from the already-loaded manifest (`useContent()`), never from
 * `meta.repository.ts` — see `db/repositories/backup.repository.ts`'s file header for why
 * that table is never actually populated by anything in the app today.
 */
import { useContent } from '@/app/providers/content-context.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { SettingRow } from './SettingRow.tsx'
import { APP_VERSION } from '../lib/app-info.ts'

export function AboutSection() {
  const { manifest, wordCount } = useContent()

  return (
    <Card>
      <CardHeader>
        <CardTitle>О приложении</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        <SettingRow label="Версия приложения">
          <span className="text-sm tabular-nums text-muted-foreground">{APP_VERSION}</span>
        </SettingRow>
        <SettingRow label="Версия контента">
          <span className="text-sm tabular-nums text-muted-foreground">
            {manifest.contentVersion}
          </span>
        </SettingRow>
        <SettingRow label="Слов в базе">
          <span className="text-sm tabular-nums text-muted-foreground">
            {wordCount.toLocaleString('ru-RU')}
          </span>
        </SettingRow>
      </CardContent>
    </Card>
  )
}
