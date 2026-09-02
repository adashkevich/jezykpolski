/**
 * `useOnlineStatus` tests (`spec/tasks/25-offline-update.md` §4).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus.ts'

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

describe('useOnlineStatus', () => {
  it('reflects navigator.onLine at mount time', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('flips to false on a window "offline" event', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('flips back to true on a window "online" event', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
