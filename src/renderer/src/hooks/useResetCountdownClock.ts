import { useEffect, useSyncExternalStore } from 'react'
import { nextResetLabelBoundary } from '@/lib/reset-countdown'

/**
 * A single status-bar countdown clock shared by every usage countdown (the
 * collapsed badge, the expanded provider panel, Codex reset-credit expiry).
 *
 * Two reasons it is a shared singleton rather than a per-component interval:
 * - It schedules a one-shot timeout at the *next label boundary* instead of
 *   waking every 30s, so it stays idle when no visible label can change (and
 *   stops entirely once all windows have reset).
 * - Every consumer subscribes to the same tick, so the badge and the open panel
 *   re-render together and never show a different minute for the same window.
 *
 * The subscription only *schedules* re-renders; the displayed `now` is read live
 * from `Date.now()` so the first render (before any tick) and faked-timer tests
 * stay correct.
 */

type Listener = () => void

const listeners = new Set<Listener>()
// The tick counter: only changes when the clock fires, which is what triggers a
// re-render. It is not the displayed time — see `useResetCountdownNow`.
let tick = Date.now()
let timer: ReturnType<typeof setTimeout> | null = null
let scheduledWakeAt = Infinity

function cancelWake(): void {
  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }
  scheduledWakeAt = Infinity
}

function fire(): void {
  timer = null
  scheduledWakeAt = Infinity
  tick = Date.now()
  // Consumers recompute and re-register their next boundary as they re-render.
  listeners.forEach((listener) => listener())
}

/** Ask the clock to wake at `atMs`; it fires at the earliest boundary requested. */
function requestWakeAt(atMs: number): void {
  if (!Number.isFinite(atMs)) {
    return
  }
  const now = Date.now()
  // A boundary already in the past should fire promptly, but never as a 0ms
  // loop that could starve rendering.
  const target = atMs <= now ? now + 250 : atMs
  if (target >= scheduledWakeAt) {
    return
  }
  scheduledWakeAt = target
  if (timer != null) {
    clearTimeout(timer)
  }
  timer = setTimeout(fire, Math.max(0, target - now))
}

function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) {
    // Restart from the real current time so a boundary computed against a tick
    // cached before an idle gap (module load, or all windows reset) is accurate.
    tick = Date.now()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      cancelWake()
    }
  }
}

function getSnapshot(): number {
  return tick
}

/**
 * Shared live `now` for one or more countdown targets: subscribes to the clock
 * (so the component re-renders when the soonest label ticks) and registers the
 * earliest upcoming label boundary across the given windows. Nullish entries
 * (windows without a known reset, or already reset) are skipped.
 */
export function useResetCountdownNow(...resetsAts: (number | null | undefined)[]): number {
  const currentTick = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  // Compute the next wake from the stable tick (not live Date.now()) so the
  // effect dependency only changes on a real boundary, not on every render.
  const nextBoundary = resetsAts.reduce<number | null>((soonest, resetsAt) => {
    if (resetsAt == null) {
      return soonest
    }
    const boundary = nextResetLabelBoundary(resetsAt, currentTick)
    if (boundary == null) {
      return soonest
    }
    return soonest == null || boundary < soonest ? boundary : soonest
  }, null)
  useEffect(() => {
    if (nextBoundary != null) {
      requestWakeAt(nextBoundary)
    }
  }, [nextBoundary])
  return Date.now()
}
