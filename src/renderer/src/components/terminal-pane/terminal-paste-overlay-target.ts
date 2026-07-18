const TERMINAL_PASTE_OVERLAY_SELECTOR = [
  '[data-terminal-search-root]',
  '[data-native-chat-root="true"]',
  '.terminal-rich-input-dock'
].join(',')

/** Whether a higher-level terminal editor owns paste instead of the raw PTY. */
export function terminalPasteIsOwnedByOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TERMINAL_PASTE_OVERLAY_SELECTOR) !== null
}
