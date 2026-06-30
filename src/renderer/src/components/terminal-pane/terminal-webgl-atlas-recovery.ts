import { resetAllTerminalWebglAtlases } from '@/lib/pane-manager/pane-manager-registry'

// Why: corruption appears within a frame of the redraw, but a stretched/partial
// paint can persist a few hundred ms; reset on the next frame plus at 120/500ms
// covers the window without a tight reset loop.
const WEBGL_ATLAS_RECOVERY_DELAYS_MS = [120, 500]
let terminalAtlasRecoveryScheduled = false

function scheduleNextFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(callback)
    return
  }
  globalThis.setTimeout(callback, 0)
}

function resetAtlases(): void {
  try {
    // Why: the glyph atlas is shared across same-config terminals, so the
    // recovery reset must rebuild every live terminal's render model — a
    // single-manager reset would garble the others.
    resetAllTerminalWebglAtlases()
  } catch {
    /* ignore - terminal pane may have unmounted before the reset fires */
  }
}

function scheduleWebglAtlasRecovery(): void {
  scheduleNextFrame(() => resetAtlases())
  for (const delayMs of WEBGL_ATLAS_RECOVERY_DELAYS_MS) {
    globalThis.setTimeout(() => resetAtlases(), delayMs)
  }
}

export function scheduleTerminalWebglAtlasRecovery(): void {
  // Why: renderer-risk output arrives in bursts (a HUD repaints many frames in a
  // row); coalesce them into one recovery window so the burst can't queue a
  // reset per chunk. Re-arms once the window's last reset has fired.
  if (terminalAtlasRecoveryScheduled) {
    return
  }
  terminalAtlasRecoveryScheduled = true
  scheduleWebglAtlasRecovery()
  globalThis.setTimeout(
    () => {
      terminalAtlasRecoveryScheduled = false
    },
    WEBGL_ATLAS_RECOVERY_DELAYS_MS.at(-1) ?? 0
  )
}

export function scheduleImagePasteWebglAtlasRecovery(): void {
  // Why: Claude Code redraws its image chip immediately after bracketed paste,
  // and xterm WebGL atlas corruption can appear after that redraw without a
  // context-loss event. A few cheap resets cover the post-paste paint window.
  scheduleWebglAtlasRecovery()
}
