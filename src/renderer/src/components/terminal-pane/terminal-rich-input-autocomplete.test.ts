import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  findTerminalRichInputMentionQuery,
  findTerminalRichInputSlashQuery
} from './terminal-rich-input-autocomplete'

function editorWithText(text: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
    }
  })
  editor.commands.setTextSelection(text.length + 1)
  return editor
}

describe('terminal rich input autocomplete queries', () => {
  it('finds file mentions and slash commands at the caret', () => {
    const mentionEditor = editorWithText('review @src')
    const slashEditor = editorWithText('/comp')

    expect(findTerminalRichInputMentionQuery(mentionEditor as never)?.query).toBe('src')
    expect(findTerminalRichInputSlashQuery(slashEditor as never)?.query).toBe('comp')
  })

  it('only triggers slash commands in the absolute first token', () => {
    for (const text of ['https://example.com', 'please /comp', ' /comp']) {
      const editor = editorWithText(text)
      expect(findTerminalRichInputSlashQuery(editor as never)).toBeNull()
    }
  })
})
