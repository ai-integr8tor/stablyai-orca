// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResetCountdownNow } from './useResetCountdownClock'

const BASE = 1_700_000_000_000
const MINUTE = 60_000

describe('useResetCountdownNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE)
  })

  afterEach(() => {
    // Unmount so the shared clock's listeners drain to zero between tests; the
    // next mount then restarts `tick` from the freshly faked system time.
    cleanup()
    vi.useRealTimers()
  })

  it('starts from the real current time on first mount', () => {
    const { result } = renderHook(() => useResetCountdownNow(BASE + 90_000))
    expect(result.current).toBe(BASE)
  })

  it('does not tick before the label boundary, then advances on it', async () => {
    // 1m30s remaining: the label ("1m") next changes 30s later, not sooner.
    const { result } = renderHook(() => useResetCountdownNow(BASE + 90_000))
    expect(result.current).toBe(BASE)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000)
    })
    expect(result.current).toBe(BASE)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(result.current).toBe(BASE + 30_000)
  })

  it('shares one now across every consumer', async () => {
    const badge = renderHook(() => useResetCountdownNow(BASE + 90_000))
    const panel = renderHook(() => useResetCountdownNow(BASE + 5 * MINUTE))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    // The earliest boundary (badge's, at +30s) drives the shared tick.
    expect(badge.result.current).toBe(BASE + 30_000)
    expect(panel.result.current).toBe(BASE + 30_000)
  })

  it('stops waking once the window has reset (stable label)', async () => {
    const { result } = renderHook(() => useResetCountdownNow(BASE + 30_000))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    // Reached zero; label is now stable, so no further wake should be scheduled.
    expect(result.current).toBe(BASE + 30_000)
    const settled = result.current

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
    })
    expect(result.current).toBe(settled)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('schedules nothing for a nullish reset target', () => {
    renderHook(() => useResetCountdownNow(null))
    expect(vi.getTimerCount()).toBe(0)
  })
})
