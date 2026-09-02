/**
 * "Скачать все формы для офлайна" row (`spec/tasks/24-settings-backup.md` §1/§5, FR-134).
 * See `../lib/paradigm-prefetch.ts`'s header for the Cache Storage / cache-naming design and
 * its relationship to task 25's future service-worker runtime cache.
 *
 * State is derived from Cache Storage itself (`isParadigmPrefetchComplete`) rather than
 * mirrored into a `settings` boolean — there is exactly one source of truth for "is this
 * done" (how many of the 64 shards are actually sitting in the cache), and a separate
 * settings flag could only ever drift from it (e.g. if task 25's own runtime cache empties
 * under storage pressure, or the shards were fetched by ordinary browsing rather than this
 * toggle).
 */
import { useEffect, useRef, useState } from 'react'
import { useContent } from '@/app/providers/content-context.ts'
import { Button } from '@/components/ui/button.tsx'
import { PARADIGMS_SHARD_COUNT } from '@/content/codec.ts'
import {
  isAbortError,
  isParadigmPrefetchComplete,
  prefetchAllParadigmShards,
} from '../lib/paradigm-prefetch.ts'
import { SettingRow } from './SettingRow.tsx'

type PrefetchState =
  | { readonly phase: 'checking' }
  | { readonly phase: 'idle' }
  | { readonly phase: 'running'; readonly done: number; readonly total: number }
  | { readonly phase: 'done' }
  | { readonly phase: 'error'; readonly message: string }

export function ParadigmPrefetchToggle() {
  const { manifest } = useContent()
  const [state, setState] = useState<PrefetchState>({ phase: 'checking' })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    isParadigmPrefetchComplete(manifest.contentVersion)
      .then((complete) => {
        if (alive) setState(complete ? { phase: 'done' } : { phase: 'idle' })
      })
      .catch(() => {
        if (alive) setState({ phase: 'idle' })
      })
    return () => {
      alive = false
    }
  }, [manifest.contentVersion])

  async function start() {
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ phase: 'running', done: 0, total: PARADIGMS_SHARD_COUNT })
    try {
      await prefetchAllParadigmShards(
        manifest.contentVersion,
        (progress) => setState({ phase: 'running', done: progress.done, total: progress.total }),
        controller.signal,
      )
      setState({ phase: 'done' })
    } catch (error: unknown) {
      if (isAbortError(error)) {
        setState({ phase: 'idle' })
      } else {
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      controllerRef.current = null
    }
  }

  function cancel() {
    controllerRef.current?.abort()
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <SettingRow label="Скачать все формы для офлайна">
        {state.phase === 'checking' && (
          <span className="text-sm text-muted-foreground">Проверяем…</span>
        )}
        {(state.phase === 'idle' || state.phase === 'error') && (
          <Button type="button" variant="outline" size="sm" onClick={start}>
            Скачать (64 шарда, ~1 МБ)
          </Button>
        )}
        {state.phase === 'running' && (
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Отменить
          </Button>
        )}
        {state.phase === 'done' && (
          <span className="text-sm text-success">Готово ({PARADIGMS_SHARD_COUNT}/{PARADIGMS_SHARD_COUNT})</span>
        )}
      </SettingRow>

      {state.phase === 'running' && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Загрузка форм для офлайна"
            aria-valuenow={state.done}
            aria-valuemin={0}
            aria-valuemax={state.total}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(state.done / state.total) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {state.done} из {state.total}
          </span>
        </div>
      )}

      {state.phase === 'error' && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}
    </div>
  )
}
