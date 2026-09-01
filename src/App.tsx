import { AppProviders } from '@/app/providers/AppProviders.tsx'
import { AppRouter } from '@/app/router.tsx'

/**
 * Real entry point (`spec/tasks/06-app-shell-pwa.md`). `AppProviders` gates rendering on
 * "the database is open and the word index is loaded" (tasks 05/04); `AppRouter` then
 * renders `AppShell` + the route for whatever URL the app was opened at.
 */
function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}

export default App
