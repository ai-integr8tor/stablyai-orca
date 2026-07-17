// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { terminalPasteIsOwnedByOverlay } from './terminal-paste-overlay-target'

describe('terminalPasteIsOwnedByOverlay', () => {
  it.each([
    '<div class="terminal-rich-input-dock"><div class="editor"></div></div>',
    '<div data-native-chat-root="true"><textarea></textarea></div>',
    '<div data-terminal-search-root><input></div>'
  ])('keeps paste inside higher-level terminal editors', (markup) => {
    const root = document.createElement('div')
    root.innerHTML = markup
    expect(terminalPasteIsOwnedByOverlay(root.querySelector('div, textarea, input'))).toBe(true)
  })

  it('leaves raw xterm paste routing enabled', () => {
    const textarea = document.createElement('textarea')
    textarea.className = 'xterm-helper-textarea'
    expect(terminalPasteIsOwnedByOverlay(textarea)).toBe(false)
  })
})
