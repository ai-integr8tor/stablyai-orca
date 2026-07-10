import type { Editor } from '@tiptap/react'

/**
 * Auto-focuses the rich markdown editor on mount so users can start typing
 * immediately (matching MonacoEditor's behavior). Guards against focus theft
 * from modals/dialogs and skips scrollIntoView to avoid racing with
 * useEditorScrollRestore.
 */
export function autoFocusRichEditor(nextEditor: Editor, rootEl: HTMLElement | null): () => void {
  let frameId: number | null = requestAnimationFrame(() => {
    frameId = null
    if (nextEditor.isDestroyed) {
      return
    }
    // Why: Explorer file-row activation hands focus to the opened editor, matching Monaco.
    // Other controls retain focus so lazy mounts cannot disrupt fields or dialogs.
    const active = document.activeElement
    const canTakeFocus =
      active === null ||
      active === document.body ||
      (rootEl?.contains(active) ?? false) ||
      Boolean(active?.closest('[data-file-explorer-row]'))
    if (!canTakeFocus) {
      return
    }
    // Why: pass 'start' (not null) to resolve to a proper TextSelection at
    // doc position 1. With null, Tiptap keeps whatever the editor's current
    // selection happens to be on mount — for a freshly-created empty doc
    // that's an AllSelection, which renders as a visible 0-width highlight
    // inside the placeholder instead of a normal blinking caret.
    //
    // Why: `scrollIntoView: false` prevents Tiptap's focus command from
    // scrolling the cursor into view, which would otherwise race with
    // useEditorScrollRestore's RAF retry loop and clobber the cached
    // scroll position on every tab switch.
    nextEditor.commands.focus('start', { scrollIntoView: false })
  })
  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }
}
