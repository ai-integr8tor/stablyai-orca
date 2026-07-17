import { describe, expect, it, vi } from 'vitest'
import { removeWrittenTerminalRichInputContent } from './terminal-rich-input-submit-reconcile'

describe('removeWrittenTerminalRichInputContent', () => {
  it('removes only attachment and text stages that already reached the PTY', () => {
    const removeAttachment = vi.fn()
    const clearContent = vi.fn()

    removeWrittenTerminalRichInputContent(
      { status: 'partially-written', imagePathsWritten: 1, textWritten: true },
      [
        { id: 'first', path: '/tmp/first.png' },
        { id: 'second', path: '/tmp/second.png' }
      ],
      { commands: { clearContent } } as never,
      removeAttachment
    )

    expect(removeAttachment).toHaveBeenCalledOnce()
    expect(removeAttachment).toHaveBeenCalledWith('first')
    expect(clearContent).toHaveBeenCalledOnce()
  })
})
