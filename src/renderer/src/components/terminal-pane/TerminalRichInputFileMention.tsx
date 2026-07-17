import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { basename } from '@/lib/path'
import { safeReactNodeViewRenderer } from '@/components/editor/safe-react-node-view-renderer'
import { formatNativeChatFileReference } from '../native-chat/native-chat-composer-target'
import { TERMINAL_RICH_INPUT_FILE_MENTION_NODE } from './terminal-rich-input-model'

export const TerminalRichInputFileMention = Node.create({
  name: TERMINAL_RICH_INPUT_FILE_MENTION_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { path: { default: '' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-terminal-file-mention]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-terminal-file-mention': '',
        'data-path': node.attrs.path
      }),
      formatNativeChatFileReference(String(node.attrs.path ?? ''))
    ]
  },

  renderText({ node }) {
    return formatNativeChatFileReference(String(node.attrs.path ?? ''))
  },

  addNodeView() {
    return safeReactNodeViewRenderer(TerminalRichInputFileMentionView, { as: 'span' })
  }
})

function TerminalRichInputFileMentionView({ node }: NodeViewProps): React.JSX.Element {
  const path = String(node.attrs.path ?? '')
  const FileIcon = getFileTypeIcon(path)
  return (
    <NodeViewWrapper
      as="span"
      data-terminal-rich-input-mention=""
      title={path}
      contentEditable={false}
      className="mx-0.5 inline-flex h-6 max-w-64 select-none items-center gap-1 rounded-md border border-border bg-muted px-1.5 align-middle text-xs text-foreground"
    >
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{basename(path) || path}</span>
    </NodeViewWrapper>
  )
}
