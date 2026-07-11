/**
 * Formats the time remaining until a usage window resets.
 *
 * Shared by the expanded usage popover and the collapsed status-bar badge so
 * both render the same live countdown (e.g. "3h 31m", "45m", "2d 4h") instead
 * of a fixed window-length label.
 */
export function formatResetDuration(ms: number): string {
  if (ms <= 0) {
    return 'now'
  }
  const totalMins = Math.floor(ms / 60_000)
  // Why: sub-minute durations floor to 0, and "0m" reads as already-reset; show
  // "<1m" so the final minute before reset stays distinct from "now" (ms <= 0).
  // The shared clock wakes at the boundary that reaches this final minute.
  if (totalMins === 0) {
    return '<1m'
  }
  if (totalMins < 60) {
    return `${totalMins}m`
  }
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function formatResetCountdown(ms: number): string {
  const duration = formatResetDuration(ms)
  return duration === 'now' ? 'Resets now' : `Resets in ${duration}`
}

/**
 * The next timestamp at which a live countdown label for `resetsAt` will change,
 * given the current `now`. Labels are minute-floored, so the value only ticks
 * when the remaining time crosses a whole minute (and finally reaches zero).
 *
 * Returns `null` once the window has already reset — the label is then stable
 * ("now" / "Resets now"), so the shared clock can stop waking for it.
 */
export function nextResetLabelBoundary(resetsAt: number, now: number): number | null {
  const remaining = resetsAt - now
  if (remaining <= 0) {
    return null
  }
  // Wake when `remaining` next crosses a whole minute; the sub-minute remainder
  // is that delay, and an exact multiple means a full minute until the next tick.
  const msUntilNextTick = remaining % 60_000 || 60_000
  return now + msUntilNextTick
}
