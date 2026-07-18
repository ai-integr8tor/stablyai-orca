export type TerminalRichInputImageAttachment = {
  id: string
  path: string
  previewSrc?: string
}

const MAX_TERMINAL_RICH_INPUT_ATTACHMENT_SCOPES = 128
const attachmentCache = new Map<string, TerminalRichInputImageAttachment[]>()

export function readTerminalRichInputAttachments(
  scopeKey: string
): TerminalRichInputImageAttachment[] {
  const attachments = attachmentCache.get(scopeKey) ?? []
  if (attachments.length > 0) {
    attachmentCache.delete(scopeKey)
    attachmentCache.set(scopeKey, attachments)
  }
  return [...attachments]
}

export function writeTerminalRichInputAttachments(
  scopeKey: string,
  attachments: readonly TerminalRichInputImageAttachment[]
): void {
  if (attachments.length === 0) {
    attachmentCache.delete(scopeKey)
    return
  }
  attachmentCache.delete(scopeKey)
  attachmentCache.set(scopeKey, [...attachments])
  while (attachmentCache.size > MAX_TERMINAL_RICH_INPUT_ATTACHMENT_SCOPES) {
    const oldest = attachmentCache.keys().next().value
    if (typeof oldest !== 'string') {
      break
    }
    attachmentCache.delete(oldest)
  }
}

export function clearTerminalRichInputAttachmentCacheForTests(): void {
  attachmentCache.clear()
}
