import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Временная точка входа. Роутинг, AppShell и реальные экраны появятся в задаче 06.
 * Здесь только проверка, что тулчейн (Tailwind, токены, shadcn/ui) работает.
 */
function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Polski</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            Тулчейн настроен. Приложение появится в следующих задачах.
          </p>
          <Button>Продолжить</Button>
        </CardContent>
      </Card>
    </main>
  )
}

export default App
