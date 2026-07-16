import { useCallback, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { attachMobileFileToTerminal } from './mobile-terminal-attachment'
import {
  ImageLibraryPermissionError,
  pickMobileAttachment,
  type MobileAttachmentSource
} from './mobile-attachment-picker'

type CurrentRef<T> = {
  readonly current: T
}

type ShowToast = (message: string, durationMs?: number) => void

type UseMobileTerminalAttachmentArgs = {
  readonly client: RpcClient | null
  readonly activeHandle: string | null
  readonly canSend: boolean
  readonly connState: ConnectionState
  // True when the host advertises clipboard.file-upload.v1: unfiltered picker
  // only on hosts that honor fileName.
  readonly canAttachAnyFile: boolean
  readonly deviceTokenRef: CurrentRef<string | null>
  readonly getActiveWorktreeConnectionId: () => Promise<string | null>
  readonly showToast: ShowToast
  readonly onSuccess: () => void
  readonly onError: () => void
  readonly beforeTerminalSend?: (terminal: string) => Promise<boolean>
}

type MobileTerminalAttachment = {
  readonly attachToTerminal: (source: MobileAttachmentSource) => Promise<void>
  // True only while the picked attachment is uploading to the host (not while
  // the picker is open) — drives the send spinner so the 3-5s transfer isn't a no-op.
  readonly isAttaching: boolean
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useMobileTerminalAttachment({
  client,
  activeHandle,
  canSend,
  connState,
  canAttachAnyFile,
  deviceTokenRef,
  getActiveWorktreeConnectionId,
  showToast,
  onSuccess,
  onError,
  beforeTerminalSend
}: UseMobileTerminalAttachmentArgs): MobileTerminalAttachment {
  const [isAttaching, setIsAttaching] = useState(false)
  const attachToTerminal = useCallback(
    async (source: MobileAttachmentSource): Promise<void> => {
      if (!client || !activeHandle || !canSend) {
        return
      }
      try {
        const sent = await attachMobileFileToTerminal(source, {
          client,
          terminal: activeHandle,
          deviceToken: deviceTokenRef.current,
          getConnectionId: getActiveWorktreeConnectionId,
          // Explicit wrapper: pickMobileAttachment's second param is test-only
          // deps, so passing it bare would swallow the picker options.
          pickAttachment: (pickSource, options) =>
            pickMobileAttachment(pickSource, undefined, options),
          canAttachAnyFile,
          onUploadStart: () => setIsAttaching(true),
          beforeTerminalSend
        })
        // Cancelled picker: no error, no toast.
        if (sent) {
          onSuccess()
        }
      } catch (error) {
        onError()
        if (connState !== 'connected') {
          showToast('Attach failed (disconnected)', 1500)
          return
        }
        if (error instanceof ImageLibraryPermissionError) {
          showToast('Photo permission denied', 1500)
          return
        }
        if (getErrorMessage(error) === 'Clipboard image is too large') {
          // Document picks have no downscale path, so oversized files fail
          // fast; word the toast for whichever picker the user came from.
          showToast(
            source === 'files' ? 'File too large to attach' : 'Image too large to attach',
            1500
          )
          return
        }
        showToast('Attach failed', 1500)
      } finally {
        setIsAttaching(false)
      }
    },
    [
      activeHandle,
      beforeTerminalSend,
      canAttachAnyFile,
      canSend,
      client,
      connState,
      deviceTokenRef,
      getActiveWorktreeConnectionId,
      onError,
      onSuccess,
      showToast
    ]
  )

  return { attachToTerminal, isAttaching }
}
