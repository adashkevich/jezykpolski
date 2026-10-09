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
 * folded into the first. Task 48 put its `word-id-renames-v2` step in front of both and made
 * the steps run one after another (the recomputes throw on un-migrated `wordId`s). Task 49
 * appended `content-v2-level-reset` after all of them.
 */
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { StartupMigrations } from './StartupMigrations.tsx'
import * as contentV2LevelResetRepo from '@/db/repositories/content-v2-level-reset.repository.ts'
import * as metaRepo from '@/db/repositories/meta.repository.ts'
import * as wordIdRenamesRepo from '@/db/repositories/word-id-renames.repository.ts'
import * as wordsProgressRepo from '@/db/repositories/words-progress.repository.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('StartupMigrations', () => {
  it('runs every migration via runOnce, task 48 first and task 49 last, and renders nothing', async () => {
    const runOnceSpy = vi.spyOn(metaRepo, 'runOnce').mockResolvedValue(true)

    const { container } = render(<StartupMigrations />)

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(4))
    expect(runOnceSpy.mock.calls).toEqual([
      ['word-id-renames-v2', wordIdRenamesRepo.runWordIdRenamesMigration],
      ['recompute-word-progress-for-stage-gate', wordsProgressRepo.recomputeAll],
      ['recompute-word-progress-for-three-stage-vocab', wordsProgressRepo.recomputeAll],
      ['content-v2-level-reset', contentV2LevelResetRepo.runContentV2LevelReset],
    ])
    expect(container).toBeEmptyDOMElement()
  })

  it('runs the steps one after another — the next starts only once the previous settled', async () => {
    let finishFirst: (ran: boolean) => void = () => {}
    const runOnceSpy = vi
      .spyOn(metaRepo, 'runOnce')
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishFirst = resolve)))
      .mockResolvedValue(true)

    render(<StartupMigrations />)

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runOnceSpy).toHaveBeenCalledTimes(1)

    finishFirst(true)
    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(4))
  })

  it('a failing migration is swallowed — no throw, nothing rendered, the next step still runs', async () => {
    const runOnceSpy = vi
      .spyOn(metaRepo, 'runOnce')
      .mockRejectedValue(new Error('simulated migration failure'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { container } = render(<StartupMigrations />)

    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(4))
    expect(runOnceSpy).toHaveBeenCalledTimes(4)
    expect(container).toBeEmptyDOMElement()
  })

  it('under StrictMode double-invoked effects, each migration still runs only once', async () => {
    const runOnceSpy = vi.spyOn(metaRepo, 'runOnce').mockResolvedValue(true)

    render(
      <StrictMode>
        <StartupMigrations />
      </StrictMode>,
    )

    await waitFor(() => expect(runOnceSpy).toHaveBeenCalledTimes(4))
    // Give any accidental extra invocation a chance to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runOnceSpy).toHaveBeenCalledTimes(4)
  })
})
