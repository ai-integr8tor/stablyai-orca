import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearTerminalRichInputDraftsForTests,
  readTerminalRichInputDraft,
  writeTerminalRichInputDraft
} from './terminal-rich-input-draft'

describe('terminal rich input drafts', () => {
  beforeEach(() => clearTerminalRichInputDraftsForTests())

  it('keeps independent drafts for stable terminal leaves', () => {
    writeTerminalRichInputDraft('tab-1:leaf-a', 'first')
    writeTerminalRichInputDraft('tab-1:leaf-b', 'second')

    expect(readTerminalRichInputDraft('tab-1:leaf-a')).toBe('first')
    expect(readTerminalRichInputDraft('tab-1:leaf-b')).toBe('second')
  })

  it('drops an empty draft', () => {
    writeTerminalRichInputDraft('tab-1:leaf-a', 'first')
    writeTerminalRichInputDraft('tab-1:leaf-a', '')

    expect(readTerminalRichInputDraft('tab-1:leaf-a')).toBe('')
  })
})
