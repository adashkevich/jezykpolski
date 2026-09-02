/**
 * Application routes (`spec/tasks/06-app-shell-pwa.md` §1, `architecture.md` §9).
 *
 * Declarative-mode React Router (`<BrowserRouter>` + `<Routes>`/`<Route>`, not the
 * `createBrowserRouter` data APIs, and NOT `HashRouter` — the task text is explicit about
 * both). Real paths, so the host must serve the SPA fallback (`vite preview` and every dev
 * server already do this; production hosting is `blueprint.md` §6's concern).
 *
 * All routes render inside `AppShell` (top bar + bottom nav), so nothing here needs to
 * repeat that chrome. `AppProviders` (content + database readiness) wraps this router from
 * `App.tsx`, one level up — by the time any route below renders, both are already settled.
 *
 * `:wordId` is URL-encoded via `wordPath()`/`parseWordParam()` (`./word-path.ts`) — see that
 * file's header for why the encoding helpers live there and not here.
 */
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app/AppShell.tsx'
import { HomePage } from '@/pages/home/HomePage.tsx'
import { WordsListPage } from '@/pages/words/WordsListPage.tsx'
import { WordDetailPage } from '@/pages/words/WordDetailPage.tsx'
import { NounsListPage } from '@/pages/nouns/NounsListPage.tsx'
import { VerbsListPage } from '@/pages/verbs/VerbsListPage.tsx'
import { AdjectivesListPage } from '@/pages/adjectives/AdjectivesListPage.tsx'
import { SessionPage } from '@/pages/session/SessionPage.tsx'
import { SessionResultPage } from '@/pages/session/SessionResultPage.tsx'
import { PracticeSetupPage } from '@/pages/practice/PracticeSetupPage.tsx'
import { TablePracticePage } from '@/pages/practice/TablePracticePage.tsx'
import { VerbTablePracticePage } from '@/pages/practice/VerbTablePracticePage.tsx'
import { MatchingPracticePage } from '@/pages/practice/MatchingPracticePage.tsx'
import { StatsPage } from '@/pages/stats/StatsPage.tsx'
import { SettingsPage } from '@/pages/settings/SettingsPage.tsx'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage.tsx'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="words" element={<WordsListPage />} />
          <Route path="words/:wordId" element={<WordDetailPage />} />
          <Route path="nouns" element={<NounsListPage />} />
          <Route path="verbs" element={<VerbsListPage />} />
          <Route path="adjectives" element={<AdjectivesListPage />} />
          <Route path="session" element={<SessionPage />} />
          <Route path="session/result" element={<SessionResultPage />} />
          <Route path="practice" element={<PracticeSetupPage />} />
          <Route path="practice/table/:wordId" element={<TablePracticePage />} />
          <Route path="practice/verb-table/:wordId/:tense" element={<VerbTablePracticePage />} />
          <Route path="practice/matching" element={<MatchingPracticePage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
