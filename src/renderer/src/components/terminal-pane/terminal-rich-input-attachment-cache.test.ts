import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearTerminalRichInputAttachmentCacheForTests,
  readTerminalRichInputAttachments,
  writeTerminalRichInputAttachments
} from './terminal-rich-input-attachment-cache'

describe('terminal rich input attachment cache', () => {
  beforeEach(clearTerminalRichInputAttachmentCacheForTests)

  it('keeps pending images scoped to one terminal leaf', () => {
    writeTerminalRichInputAttachments('tab:leaf-a', [{ id: '1', path: '/tmp/image.png' }])

    expect(readTerminalRichInputAttachments('tab:leaf-a')).toEqual([
      { id: '1', path: '/tmp/image.png' }
    ])
    expect(readTerminalRichInputAttachments('tab:leaf-b')).toEqual([])
  })

  it('returns defensive copies and deletes empty entries', () => {
    writeTerminalRichInputAttachments('scope', [{ id: '1', path: '/tmp/image.png' }])
    const first = readTerminalRichInputAttachments('scope')
    first.length = 0
    expect(readTerminalRichInputAttachments('scope')).toHaveLength(1)

    writeTerminalRichInputAttachments('scope', [])
    expect(readTerminalRichInputAttachments('scope')).toEqual([])
  })
})
