// Why: the deferred tray is always created on Windows, never gated on Linux
// (createSystemTray no-ops there anyway), and on macOS only when the user opted
// into the menu-bar icon (keepServingOnClose + showTrayIconWhileClosed).
export function shouldCreateDeferredTray(options: {
  platform: NodeJS.Platform
  keepServingOnClose: boolean
  showTrayIconWhileClosed: boolean
}): boolean {
  if (options.platform !== 'darwin') {
    return true
  }
  return options.keepServingOnClose && options.showTrayIconWhileClosed
}
