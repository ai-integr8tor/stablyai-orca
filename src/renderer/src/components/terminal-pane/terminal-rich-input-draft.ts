const MAX_TERMINAL_RICH_INPUT_DRAFTS = 128
const drafts = new Map<string, string>()

export function readTerminalRichInputDraft(scopeKey: string): string {
  const draft = drafts.get(scopeKey) ?? ''
  if (draft) {
    // Refresh insertion order so active panes survive bounded eviction.
    drafts.delete(scopeKey)
    drafts.set(scopeKey, draft)
  }
  return draft
}

export function writeTerminalRichInputDraft(scopeKey: string, draft: string): void {
  drafts.delete(scopeKey)
  if (!draft) {
    return
  }
  drafts.set(scopeKey, draft)
  while (drafts.size > MAX_TERMINAL_RICH_INPUT_DRAFTS) {
    const oldest = drafts.keys().next().value
    if (typeof oldest !== 'string') {
      break
    }
    drafts.delete(oldest)
  }
}

export function clearTerminalRichInputDraftsForTests(): void {
  drafts.clear()
}
