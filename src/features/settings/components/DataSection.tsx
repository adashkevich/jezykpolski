/**
 * "Данные" block (`spec/tasks/24-settings-backup.md` §1) — prefetch, export, import, reset,
 * in the task text's own row order.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { ParadigmPrefetchToggle } from './ParadigmPrefetchToggle.tsx'
import { ExportButton } from './ExportButton.tsx'
import { ImportControl } from './ImportControl.tsx'
import { ResetControl } from './ResetControl.tsx'

export function DataSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Данные</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        <ParadigmPrefetchToggle />
        <ExportButton />
        <ImportControl />
        <ResetControl />
      </CardContent>
    </Card>
  )
}
