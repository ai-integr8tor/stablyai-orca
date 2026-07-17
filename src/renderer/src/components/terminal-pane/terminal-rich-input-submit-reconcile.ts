import type { Editor } from '@tiptap/react'
import type { TerminalRichInputImageAttachment } from './terminal-rich-input-attachment-cache'
import type { TerminalRichInputSubmitResult } from './terminal-rich-input-submit'

export function removeWrittenTerminalRichInputContent(
  result: Extract<TerminalRichInputSubmitResult, { status: 'partially-written' }>,
  attachments: readonly TerminalRichInputImageAttachment[],
  editor: Editor,
  removeAttachment: (id: string) => void
): void {
  // A retry must contain only stages that never reached the PTY.
  for (const attachment of attachments.slice(0, result.imagePathsWritten)) {
    removeAttachment(attachment.id)
  }
  if (result.textWritten) {
    editor.commands.clearContent()
  }
}
