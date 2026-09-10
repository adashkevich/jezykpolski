/**
 * `StartupMigrations` tests. Companion to `words-progress.repository.test.ts`'s cursor
 * regression test and `DatabaseProvider.test.tsx`: this component is what actually invokes
 * `recomputeAll` at startup now (see this file's own header for why it moved out of
 * `DatabaseProvider`), so what matters here is that its failure never surfaces — no thrown
 * error, no `ErrorState`, just a console warning — and that each of its `runOnce` migrations
 * runs at most once even under `StrictMode`'s double-invoked effects.
 *
 * Task 37 added a second, independent `runOnce` call (`THREE_STAGE_VOCAB_MIGRATION`) — see
 * this component's own header for why it's a second call under a fresh key rather than
 * folded into the first.
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
  it('runs both migrations via runOnce and renders nothing', async () => {
    const runOnceSpy = vi.spyOn(metaRepo, 'runOnce').mockResolvedValue(true)

    const { container } = render(<StartupMigrations />)

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(2))
    expect(runOnceSpy).toHaveBeenCalledWith(
      'recompute-word-progress-for-stage-gate',
      wordsProgressRepo.recomputeAll,
    )
    expect(runOnceSpy).toHaveBeenCalledWith(
      'recompute-word-progress-for-three-stage-vocab',
      wordsProgressRepo.recomputeAll,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('a failing migration is swallowed — no throw, nothing rendered', async () => {
    vi.spyOn(metaRepo, 'runOnce').mockRejectedValue(new Error('simulated migration failure'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { container } = render(<StartupMigrations />)

    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(2))
    expect(container).toBeEmptyDOMElement()
  })

  it('under StrictMode double-invoked effects, each migration still runs only once', async () => {
    const runOnceSpy = vi.spyOn(metaRepo, 'runOnce').mockResolvedValue(true)

    render(
      <StrictMode>
        <StartupMigrations />
      </StrictMode>,
    )

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(2))
    // Give any accidental extra invocation a chance to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runOnceSpy).toHaveBeenCalledTimes(2)
  })
})
