// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTerminalRichInputKeyDown } from './terminal-rich-input-keydown'

function context() {
  return {
    mentionRef: { current: null },
    slashRef: { current: { from: 1, to: 4, query: 'cl' } },
    fileSuggestionsRef: { current: [] as string[] },
    slashSuggestionsRef: {
      current: [{ name: 'clear', description: 'Clear conversation' }]
    },
    activeSuggestionRef: { current: 0 },
    setActiveSuggestion: vi.fn(),
    pasteImageFromClipboard: vi.fn(),
    chooseFile: vi.fn(),
    chooseSlash: vi.fn(),
    closeAutocomplete: vi.fn(),
    closeComposer: vi.fn(),
    submit: vi.fn()
  }
}

describe('terminal rich input keydown', () => {
  afterEach(() => vi.restoreAllMocks())

  it('probes for native clipboard images without consuming Cmd+V on macOS', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Macintosh')
    const ctx = context()
    const event = new KeyboardEvent('keydown', { key: 'v', metaKey: true })

    expect(handleTerminalRichInputKeyDown(event, ctx)).toBe(false)
    expect(ctx.pasteImageFromClipboard).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(false)
  })

  it('uses Ctrl+V and ignores Windows+V on non-Mac platforms', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Windows')
    const ctx = context()

    handleTerminalRichInputKeyDown(new KeyboardEvent('keydown', { key: 'v', metaKey: true }), ctx)
    expect(ctx.pasteImageFromClipboard).not.toHaveBeenCalled()

    handleTerminalRichInputKeyDown(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }), ctx)
    expect(ctx.pasteImageFromClipboard).toHaveBeenCalledOnce()
  })

  it('dispatches the selected slash command on Enter', () => {
    const ctx = context()
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    expect(handleTerminalRichInputKeyDown(event, ctx)).toBe(true)
    expect(ctx.chooseSlash).toHaveBeenCalledWith(ctx.slashSuggestionsRef.current[0], true)
  })
})
