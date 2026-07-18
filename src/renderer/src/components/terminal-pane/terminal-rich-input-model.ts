import type { JSONContent } from '@tiptap/core'
import { formatNativeChatFileReference } from '../native-chat/native-chat-composer-target'

export const TERMINAL_RICH_INPUT_FILE_MENTION_NODE = 'terminalFileMention'

export function terminalRichInputPathsToContent(
  paths: string[],
  useMentions: boolean
): JSONContent[] {
  if (useMentions) {
    return paths.flatMap((path) => [
      { type: TERMINAL_RICH_INPUT_FILE_MENTION_NODE, attrs: { path } },
      { type: 'text', text: ' ' }
    ])
  }
  return paths.map((path) => ({
    type: 'text',
    text: `${/\s/.test(path) ? `"${path.replaceAll('"', '\\"')}"` : path} `
  }))
}

const FILE_REFERENCE_PATTERN = /(?<!\S)(?:@"((?:\\.|[^"])*)"|@(\S+))/g

export function terminalRichInputTextToContent(
  text: string,
  parseFileReferences = true
): JSONContent {
  const content: JSONContent[] = []
  if (!parseFileReferences) {
    appendTextWithHardBreaks(content, text)
    return { type: 'doc', content: [{ type: 'paragraph', content }] }
  }
  let textStart = 0
  let match = FILE_REFERENCE_PATTERN.exec(text)
  while (match) {
    appendTextWithHardBreaks(content, text.slice(textStart, match.index))
    content.push({
      type: TERMINAL_RICH_INPUT_FILE_MENTION_NODE,
      attrs: { path: match[1] ? match[1].replace(/\\"/g, '"') : match[2] }
    })
    textStart = match.index + match[0].length
    match = FILE_REFERENCE_PATTERN.exec(text)
  }
  appendTextWithHardBreaks(content, text.slice(textStart))
  return { type: 'doc', content: [{ type: 'paragraph', content }] }
}

export function terminalRichInputContentToText(doc: JSONContent): string {
  if (doc.type === 'doc') {
    return (doc.content ?? []).map(serializeBlock).join('\n')
  }
  return serializeBlock(doc)
}

function serializeBlock(node: JSONContent): string {
  if (node.type === 'text') {
    return node.text ?? ''
  }
  if (node.type === 'hardBreak') {
    return '\n'
  }
  if (node.type === TERMINAL_RICH_INPUT_FILE_MENTION_NODE) {
    return formatNativeChatFileReference(String(node.attrs?.path ?? ''))
  }
  return (node.content ?? []).map(serializeBlock).join('')
}

function appendTextWithHardBreaks(content: JSONContent[], text: string): void {
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (line) {
      content.push({ type: 'text', text: line })
    }
    if (index < lines.length - 1) {
      content.push({ type: 'hardBreak' })
    }
  })
}
