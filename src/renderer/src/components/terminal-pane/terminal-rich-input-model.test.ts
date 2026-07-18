import { describe, expect, it } from 'vitest'
import {
  terminalRichInputContentToText,
  terminalRichInputPathsToContent,
  terminalRichInputTextToContent
} from './terminal-rich-input-model'

describe('terminal rich input model', () => {
  it('parses file references into atomic editor nodes', () => {
    expect(terminalRichInputTextToContent('Review @src/app.ts and @"design notes.md"')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Review ' },
            { type: 'terminalFileMention', attrs: { path: 'src/app.ts' } },
            { type: 'text', text: ' and ' },
            { type: 'terminalFileMention', attrs: { path: 'design notes.md' } }
          ]
        }
      ]
    })
  })

  it('round trips multiline text and quoted file references', () => {
    const text = 'Review @src/app.ts\nThen open @"design notes.md"'
    expect(terminalRichInputContentToText(terminalRichInputTextToContent(text))).toBe(text)
  })

  it('leaves email addresses as ordinary text', () => {
    const content = terminalRichInputTextToContent('Ask dev@example.com about @src/app.ts')
    expect(content.content?.[0].content?.[0]).toEqual({
      type: 'text',
      text: 'Ask dev@example.com about '
    })
    expect(terminalRichInputContentToText(content)).toBe('Ask dev@example.com about @src/app.ts')
  })

  it('keeps typed at-sign tokens as plain shell text when references are disabled', () => {
    expect(terminalRichInputTextToContent('echo @release', false)).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'echo @release' }] }]
    })
  })

  it('inserts plain quoted paths instead of agent mentions for ordinary shells', () => {
    expect(
      terminalRichInputPathsToContent(['/repo/file.ts', '/repo/design notes.md'], false)
    ).toEqual([
      { type: 'text', text: '/repo/file.ts ' },
      { type: 'text', text: '"/repo/design notes.md" ' }
    ])
  })

  it('serializes multiple editor paragraphs as terminal prompt lines', () => {
    expect(
      terminalRichInputContentToText({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'second' }] }
        ]
      })
    ).toBe('first\nsecond')
  })
})
