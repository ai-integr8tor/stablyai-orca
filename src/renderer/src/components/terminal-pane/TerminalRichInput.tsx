import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { prepareQuickOpenFiles, rankQuickOpenFiles } from '@/components/quick-open-search'
import { getAgentImageHandling } from '../../../../shared/agent-image-handling'
import {
  filterSlashCommands,
  getAgentSlashCommands,
  type SlashCommandSuggestion
} from '../../../../shared/native-chat-slash-commands'
import { isImageDropPath } from './terminal-drop-image-path'
import {
  readTerminalRichInputDraft,
  writeTerminalRichInputDraft
} from './terminal-rich-input-draft'
import {
  TERMINAL_RICH_INPUT_FILE_MENTION_NODE,
  terminalRichInputContentToText,
  terminalRichInputPathsToContent,
  terminalRichInputTextToContent
} from './terminal-rich-input-model'
import { TerminalRichInputFileMention } from './TerminalRichInputFileMention'
import { TerminalRichInputFileMenu } from './TerminalRichInputFileMenu'
import { TerminalRichInputAttachments } from './TerminalRichInputAttachments'
import { TerminalRichInputSlashMenu } from './TerminalRichInputSlashMenu'
import { TerminalRichInputStatus, type TerminalRichInputSendError } from './TerminalRichInputStatus'
import {
  findTerminalRichInputMentionQuery,
  findTerminalRichInputSlashQuery,
  type TerminalRichInputQuery
} from './terminal-rich-input-autocomplete'
import { useTerminalRichInputAnimation } from './use-terminal-rich-input-animation'
import { useTerminalRichInputAttachments } from './use-terminal-rich-input-attachments'
import { useTerminalRichInputDrop } from './use-terminal-rich-input-drop'
import { handleTerminalRichInputKeyDown } from './terminal-rich-input-keydown'
import { removeWrittenTerminalRichInputContent } from './terminal-rich-input-submit-reconcile'
import type { TerminalRichInputProps } from './terminal-rich-input-types'

export function TerminalRichInput({
  open,
  pane,
  scopeKey,
  worktreeId,
  agent,
  connectionId,
  runtimeEnvironmentId,
  onClose,
  onSubmit
}: TerminalRichInputProps): React.JSX.Element {
  const initialDraft = useMemo(() => readTerminalRichInputDraft(scopeKey), [scopeKey])
  const [draft, setDraftState] = useState(initialDraft)
  const [mention, setMention] = useState<TerminalRichInputQuery | null>(null)
  const [slash, setSlash] = useState<TerminalRichInputQuery | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<TerminalRichInputSendError>(null)
  const mentionRef = useRef(mention)
  const slashRef = useRef(slash)
  const suggestionsRef = useRef<string[]>([])
  const slashSuggestionsRef = useRef<SlashCommandSuggestion[]>([])
  const activeSuggestionRef = useRef(activeSuggestion)
  const chooseFileRef = useRef<(path: string) => void>(() => {})
  const chooseSlashRef = useRef<(command: SlashCommandSuggestion, submit: boolean) => void>(
    () => {}
  )
  const submitRef = useRef<() => void>(() => {})
  const closeRef = useRef(onClose)
  mentionRef.current = mention
  slashRef.current = slash
  activeSuggestionRef.current = activeSuggestion
  closeRef.current = onClose

  const setDraft = useCallback(
    (next: string) => {
      setDraftState(next)
      writeTerminalRichInputDraft(scopeKey, next)
    },
    [scopeKey]
  )

  const editorRef = useRef<Editor | null>(null)
  const syncAutocomplete = useCallback(
    (editor: Editor) => {
      const nextMention = agent ? findTerminalRichInputMentionQuery(editor) : null
      const nextSlash = agent ? findTerminalRichInputSlashQuery(editor) : null
      setMention(nextMention)
      setSlash(nextMention ? null : nextSlash)
      if (
        nextMention?.query !== mentionRef.current?.query ||
        nextSlash?.query !== slashRef.current?.query
      ) {
        setActiveSuggestion(0)
      }
    },
    [agent]
  )
  const canAttachImages = agent ? getAgentImageHandling(agent) === 'attachment' : false
  const {
    attachments,
    attachmentBusy,
    attachmentPending,
    notice: attachmentNotice,
    appendImagePaths,
    clearAttachments,
    handlePaste,
    pasteImageFromClipboard,
    removeAttachment
  } = useTerminalRichInputAttachments({
    scopeKey,
    connectionId,
    runtimeEnvironmentId,
    focusEditor: () => editorRef.current?.commands.focus('end'),
    enabled: canAttachImages
  })

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ heading: false, blockquote: false, codeBlock: false }),
        TerminalRichInputFileMention
      ],
      content: terminalRichInputTextToContent(initialDraft, Boolean(agent)),
      editorProps: {
        attributes: {
          'aria-label': translate('components.terminal.richInput.label', 'Rich terminal input'),
          class:
            'terminal-rich-input-editor scrollbar-sleek min-h-12 max-h-40 overflow-y-auto px-2 py-1 text-sm outline-none'
        },
        handlePaste: (_view, event) => handlePaste(event),
        handleKeyDown: (_view, event) =>
          handleTerminalRichInputKeyDown(event, {
            mentionRef,
            slashRef,
            fileSuggestionsRef: suggestionsRef,
            slashSuggestionsRef,
            activeSuggestionRef,
            setActiveSuggestion,
            pasteImageFromClipboard,
            chooseFile: (path) => chooseFileRef.current(path),
            chooseSlash: (command, submit) => chooseSlashRef.current(command, submit),
            closeAutocomplete: () => {
              setMention(null)
              setSlash(null)
            },
            closeComposer: () => closeRef.current(),
            submit: () => submitRef.current()
          })
      },
      onUpdate: ({ editor: updatedEditor }) => {
        const next = terminalRichInputContentToText(updatedEditor.getJSON())
        setDraft(next)
        setSendError(null)
        syncAutocomplete(updatedEditor)
      },
      onSelectionUpdate: ({ editor: updatedEditor }) => syncAutocomplete(updatedEditor)
    },
    [scopeKey, agent]
  )
  editorRef.current = editor

  const fileList = useRuntimeFileListForWorktree({ enabled: mention !== null, worktreeId })
  const indexedFiles = useMemo(() => prepareQuickOpenFiles(fileList.files), [fileList.files])
  const suggestions = useMemo(
    () => rankQuickOpenFiles(mention?.query ?? '', indexedFiles, 8),
    [indexedFiles, mention?.query]
  )
  const suggestionPaths = useMemo(
    () => suggestions.map((suggestion) => suggestion.path),
    [suggestions]
  )
  suggestionsRef.current = suggestionPaths
  const slashSuggestions = useMemo(
    () => (agent ? filterSlashCommands(getAgentSlashCommands(agent), slash?.query ?? '') : []),
    [agent, slash?.query]
  )
  slashSuggestionsRef.current = slashSuggestions

  const chooseFile = useCallback(
    (filePath: string) => {
      const currentMention = mentionRef.current
      if (!editor || !currentMention) {
        return
      }
      editor
        .chain()
        .focus()
        .deleteRange({ from: currentMention.from, to: currentMention.to })
        .insertContent([
          { type: TERMINAL_RICH_INPUT_FILE_MENTION_NODE, attrs: { path: filePath } },
          { type: 'text', text: ' ' }
        ])
        .run()
      setMention(null)
      setActiveSuggestion(0)
    },
    [editor]
  )
  chooseFileRef.current = chooseFile

  const chooseSlash = useCallback(
    (command: SlashCommandSuggestion, submitAfterInsert: boolean) => {
      const currentSlash = slashRef.current
      if (!editor || !currentSlash) {
        return
      }
      editor
        .chain()
        .focus()
        .deleteRange({ from: currentSlash.from, to: currentSlash.to })
        .insertContent(`/${command.name}${submitAfterInsert ? '' : ' '}`)
        .run()
      setSlash(null)
      setActiveSuggestion(0)
      if (submitAfterInsert) {
        requestAnimationFrame(() => submitRef.current())
      }
    },
    [editor]
  )
  chooseSlashRef.current = chooseSlash

  const insertFilePaths = useCallback(
    (paths: string[]) => {
      const files = paths.filter((path) => !isImageDropPath(path))
      if (!editor || files.length === 0) {
        return
      }
      editor
        .chain()
        .focus()
        .insertContent(terminalRichInputPathsToContent(files, Boolean(agent)))
        .run()
    },
    [agent, editor]
  )

  const insertDroppedPaths = useCallback(
    (paths: string[]) => {
      const images = canAttachImages ? paths.filter(isImageDropPath) : []
      appendImagePaths(images)
      insertFilePaths(paths.filter((path) => !images.includes(path)))
    },
    [appendImagePaths, canAttachImages, insertFilePaths]
  )
  const dropHandlers = useTerminalRichInputDrop({ open, pane, insertPaths: insertDroppedPaths })
  const hasSubmissionContent = Boolean(draft.trim() || attachments.length > 0)
  const submissionBlocked = sending || attachmentBusy || dropHandlers.busy

  const submit = useCallback(async () => {
    if (submissionBlocked || !hasSubmissionContent || !editor) {
      return
    }
    setSending(true)
    setSendError(null)
    editor.setEditable(false)
    let result: Awaited<ReturnType<typeof onSubmit>> = { status: 'not-started' }
    try {
      result = await onSubmit(
        draft,
        attachments.map((attachment) => attachment.path)
      )
    } catch {
      result = { status: 'not-started' }
    }
    setSending(false)
    editor.setEditable(true)
    if (result.status !== 'submitted') {
      if (result.status === 'partially-written') {
        removeWrittenTerminalRichInputContent(result, attachments, editor, removeAttachment)
      }
      setSendError(result.status)
      editor.commands.focus('end')
      return
    }
    editor.commands.clearContent()
    clearAttachments()
    editor.commands.focus('start')
  }, [
    attachments,
    clearAttachments,
    draft,
    editor,
    hasSubmissionContent,
    onSubmit,
    removeAttachment,
    submissionBlocked
  ])
  submitRef.current = () => void submit()

  const { layoutOpen } = useTerminalRichInputAnimation({ open, pane })

  useEffect(() => {
    if (open) {
      editor?.commands.focus('end')
    }
  }, [editor, open])

  return (
    <div
      className={cn('terminal-rich-input-dock min-w-0', !open && 'pointer-events-none')}
      data-layout-open={layoutOpen ? '' : undefined}
      data-visible={open ? '' : undefined}
      data-pane-prevent-terminal-focus=""
      aria-hidden={!open}
      inert={open ? undefined : true}
      onPasteCapture={(event) => handlePaste(event.nativeEvent)}
      onDragOver={dropHandlers.onDragOver}
      onDrop={dropHandlers.onDrop}
    >
      <div className="terminal-rich-input-dock-content min-h-0 overflow-hidden">
        <div
          className="border-t border-border bg-transparent px-2 pb-2 pt-1.5"
          data-terminal-rich-input-dock=""
        >
          <div className="relative w-full">
            {mention ? (
              <TerminalRichInputFileMenu
                loading={fileList.loading}
                error={fileList.loadError}
                paths={suggestionPaths}
                activeIndex={activeSuggestion}
                onChoose={chooseFile}
              />
            ) : null}
            {slash ? (
              <TerminalRichInputSlashMenu
                suggestions={slashSuggestions}
                activeIndex={activeSuggestion}
                onChoose={(command) => chooseSlash(command, false)}
              />
            ) : null}
            {attachmentNotice ? (
              <div className="mb-1.5 px-1 text-xs text-destructive">{attachmentNotice}</div>
            ) : null}
            <div
              data-terminal-rich-input-card=""
              className={cn(
                'rounded-lg border border-input bg-transparent p-1.5 shadow-xs transition-colors',
                'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50'
              )}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  editor?.commands.focus('end')
                }
              }}
            >
              <TerminalRichInputAttachments
                attachments={attachments}
                pending={attachmentPending || dropHandlers.imagePending}
                connectionId={connectionId}
                runtimeEnvironmentId={runtimeEnvironmentId}
                worktreeId={worktreeId}
                onRemove={removeAttachment}
              />
              <div className="relative">
                {!draft ? (
                  <span className="pointer-events-none absolute left-2 top-1 text-sm text-muted-foreground/60">
                    {translate(
                      'components.terminal.richInput.placeholder',
                      'Write a terminal prompt…'
                    )}
                  </span>
                ) : null}
                <EditorContent editor={editor} />
              </div>
              <div className="flex items-center gap-2 px-1 pt-0.5">
                <TerminalRichInputStatus error={sendError} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto size-8 rounded-md border border-border text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                      data-terminal-rich-input-send=""
                      disabled={submissionBlocked || !hasSubmissionContent}
                      onClick={() => void submit()}
                      aria-label={translate(
                        'components.terminal.richInput.send',
                        'Send to terminal'
                      )}
                    >
                      {sending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ArrowUp className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    {translate('components.terminal.richInput.send', 'Send to terminal')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
