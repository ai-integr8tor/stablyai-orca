import { useCallback, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import {
  readTerminalRichInputAttachments,
  writeTerminalRichInputAttachments,
  type TerminalRichInputImageAttachment
} from './terminal-rich-input-attachment-cache'
import { isImageDropPath } from './terminal-drop-image-path'

type ClipboardEventLike = {
  clipboardData: DataTransfer | null
  preventDefault: () => void
  defaultPrevented: boolean
}

export function useTerminalRichInputAttachments({
  scopeKey,
  connectionId,
  runtimeEnvironmentId,
  focusEditor,
  enabled
}: {
  scopeKey: string
  connectionId: string | null
  runtimeEnvironmentId: string | null
  focusEditor: () => void
  enabled: boolean
}): {
  attachments: TerminalRichInputImageAttachment[]
  attachmentBusy: boolean
  attachmentPending: boolean
  notice: string | null
  appendImagePaths: (paths: string[], previewSrc?: string) => void
  handlePaste: (event: ClipboardEventLike) => boolean
  removeAttachments: (ids: readonly string[]) => void
  pasteImageFromClipboard: (confirmedImage?: boolean) => void
  removeAttachment: (id: string) => void
} {
  const initialAttachments = useMemo(() => readTerminalRichInputAttachments(scopeKey), [scopeKey])
  const [attachmentState, setAttachmentState] = useState(() => ({
    scopeKey,
    attachments: initialAttachments
  }))
  const attachments =
    attachmentState.scopeKey === scopeKey ? attachmentState.attachments : initialAttachments
  const [noticeState, setNoticeState] = useState({ scopeKey, notice: null as string | null })
  const notice = noticeState.scopeKey === scopeKey ? noticeState.notice : null
  const setNotice = useCallback(
    (next: string | null) => setNoticeState({ scopeKey, notice: next }),
    [scopeKey]
  )
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentPending, setAttachmentPending] = useState(false)
  const attachmentCounter = useRef(0)
  const clipboardPasteInFlight = useRef(false)
  const clipboardPasteConfirmed = useRef(false)

  const updateAttachments = useCallback(
    (
      update: (previous: TerminalRichInputImageAttachment[]) => TerminalRichInputImageAttachment[]
    ) => {
      setAttachmentState((previous) => {
        const previousAttachments =
          previous.scopeKey === scopeKey
            ? previous.attachments
            : readTerminalRichInputAttachments(scopeKey)
        const attachments = update(previousAttachments)
        writeTerminalRichInputAttachments(scopeKey, attachments)
        return { scopeKey, attachments }
      })
    },
    [scopeKey]
  )

  const appendImagePaths = useCallback(
    (paths: string[], previewSrc?: string) => {
      const images = paths.filter(isImageDropPath)
      if (images.length === 0) {
        return
      }
      updateAttachments((previous) => [
        ...previous,
        ...images.map((path, index) => {
          attachmentCounter.current += 1
          return {
            id: `${Date.now()}-${attachmentCounter.current}`,
            path,
            previewSrc: index === 0 ? previewSrc : undefined
          }
        })
      ])
      setNotice(null)
      requestAnimationFrame(focusEditor)
    },
    [focusEditor, setNotice, updateAttachments]
  )

  const pasteImageFromClipboard = useCallback(
    (confirmedImage = false) => {
      if (!enabled) {
        return
      }
      if (clipboardPasteInFlight.current) {
        clipboardPasteConfirmed.current ||= confirmedImage
        return
      }
      clipboardPasteInFlight.current = true
      clipboardPasteConfirmed.current = confirmedImage
      let pendingTimer: number | null = null
      const previewPromise = window.api.ui.readClipboardImageDataUrl
        ? window.api.ui.readClipboardImageDataUrl().catch(() => null)
        : Promise.resolve(null)
      void previewPromise
        .then(async (previewSrc) => {
          if (!previewSrc && !clipboardPasteConfirmed.current) {
            return
          }
          setAttachmentBusy(true)
          pendingTimer = window.setTimeout(() => setAttachmentPending(true), 120)
          const path = await window.api.ui.saveClipboardImageAsTempFile({
            connectionId: connectionId ?? undefined,
            runtimeEnvironmentId: runtimeEnvironmentId ?? undefined
          })
          if (path) {
            appendImagePaths([path], previewSrc ?? undefined)
          }
        })
        .catch((error) => {
          setNotice(
            extractIpcErrorMessage(
              error,
              translate('components.terminal.richInput.imagePasteFailed', 'Image paste failed.')
            )
          )
        })
        .finally(() => {
          if (pendingTimer !== null) {
            window.clearTimeout(pendingTimer)
          }
          clipboardPasteInFlight.current = false
          clipboardPasteConfirmed.current = false
          setAttachmentBusy(false)
          setAttachmentPending(false)
        })
    },
    [appendImagePaths, connectionId, enabled, runtimeEnvironmentId, setNotice]
  )

  const handlePaste = useCallback(
    (event: ClipboardEventLike): boolean => {
      if (!enabled || event.defaultPrevented) {
        return false
      }
      const data = event.clipboardData
      // Electron can expose image-only native clipboards with an empty items
      // list, so text presence is the reliable fallthrough signal.
      if (!clipboardHasImage(data) && data?.getData('text/plain')) {
        return false
      }
      event.preventDefault()
      pasteImageFromClipboard(true)
      return true
    },
    [enabled, pasteImageFromClipboard]
  )

  return {
    attachments,
    attachmentBusy,
    attachmentPending,
    notice,
    appendImagePaths,
    handlePaste,
    pasteImageFromClipboard,
    removeAttachments: (ids) => {
      const removedIds = new Set(ids)
      updateAttachments((previous) =>
        previous.filter((attachment) => !removedIds.has(attachment.id))
      )
    },
    removeAttachment: (id) =>
      updateAttachments((previous) => previous.filter((attachment) => attachment.id !== id))
  }
}

function clipboardHasImage(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.items).some((item) => item.type.startsWith('image/')))
}
