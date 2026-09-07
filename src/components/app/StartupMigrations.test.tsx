/**
 * `StartupMigrations` tests. Companion to `words-progress.repository.test.ts`'s cursor
 * regression test and `DatabaseProvider.test.tsx`: this component is what actually invokes
 * `recomputeAll` at startup now (see this file's own header for why it moved out of
 * `DatabaseProvider`), so what matters here is that its failure never surfaces — no thrown
 * error, no `ErrorState`, just a console warning — and that it runs the migration at most once
 * even under `StrictMode`'s double-invoked effects.
 */
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { StartupMigrations } from './StartupMigrations.tsx'
import * as metaRepo from '@/db/repositories/meta.repository.ts'
import * as wordsProgressRepo from '@/db/repositories/words-progress.repository.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('StartupMigrations', () => {
  it('runs the migration via runOnce and renders nothing', async () => {
    const runOnceSpy = vi.spyOn(metaRepo, 'runOnce').mockResolvedValue(true)

    const { container } = render(<StartupMigrations />)

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(1))
    expect(runOnceSpy).toHaveBeenCalledWith(
      'recompute-word-progress-for-stage-gate',
      wordsProgressRepo.recomputeAll,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('a failing migration is swallowed — no throw, nothing rendered', async () => {
    vi.spyOn(metaRepo, 'runOnce').mockRejectedValue(new Error('simulated migration failure'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { container } = render(<StartupMigrations />)

    await waitFor(() => expect(warnSpy).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('under StrictMode double-invoked effects, the migration still runs only once', async () => {
    const runOnceSpy = vi.spyOn(metaRepo, 'runOnce').mockResolvedValue(true)

    render(
      <StrictMode>
        <StartupMigrations />
      </StrictMode>,
    )

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(1))
    // Give any accidental second invocation a chance to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runOnceSpy).toHaveBeenCalledTimes(1)
  })
})
