export type ActivateWindowAction = 'show-existing' | 'open-new' | 'none'

/**
 * Decides how the app's `activate` event (macOS Dock click, taskbar, etc.)
 * should treat the main window.
 *
 * Why: keepServingOnClose HIDES (not destroys) the main window, so a Dock click
 * must reveal the still-alive-but-hidden window. `getAllWindows().length` still
 * counts a hidden window, so the pre-keepServing `length === 0` check never
 * re-showed it.
 */
export function decideActivateWindowAction(options: {
  /** A Squirrel/ShipIt update is swapping the .app bundle; leave windows alone. */
  isQuittingForUpdate: boolean
  /** The main window exists and is not destroyed (possibly just hidden). */
  hasLiveMainWindow: boolean
  /** Total open BrowserWindows (hidden windows still count). */
  openWindowCount: number
}): ActivateWindowAction {
  if (options.isQuittingForUpdate) {
    return 'none'
  }
  if (options.hasLiveMainWindow) {
    return 'show-existing'
  }
  if (options.openWindowCount === 0) {
    return 'open-new'
  }
  return 'none'
}
