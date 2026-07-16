import type { RpcClient } from '../transport/rpc-client'
import {
  buildMobileImagePastePayload,
  saveMobileAttachmentAsTempFile
} from './mobile-clipboard-image'
import type {
  MobileAttachmentPickerOptions,
  MobileAttachmentSource,
  PickedMobileAttachment
} from './mobile-attachment-picker'
import { isTerminalSendRpcAccepted } from '../terminal/terminal-send-rpc-response'

export type AttachMobileFileDeps = {
  readonly client: Pick<RpcClient, 'sendRequest'>
  readonly terminal: string
  readonly deviceToken: string | null
  readonly getConnectionId: () => Promise<string | null>
  // Injected so this module stays free of expo/react-native imports (and unit-testable).
  readonly pickAttachment: (
    source: MobileAttachmentSource,
    options: MobileAttachmentPickerOptions
  ) => Promise<PickedMobileAttachment | null>
  // True only when the host advertises clipboard.file-upload.v1; old hosts
  // strip fileName and would save any pick as `….png`, so keep the image filter.
  readonly canAttachAnyFile?: boolean
  // Fired once the user has picked an image and the host upload is about to
  // start — lets the UI show a sending spinner only for the transfer, not the
  // (potentially long) time the picker is open.
  readonly onUploadStart?: () => void
  readonly beforeTerminalSend?: (terminal: string) => Promise<boolean>
}

// Discriminates the non-thrown outcomes so the caller can react precisely:
// 'input-lease-dropped' is already toasted by the lease gate, while
// 'send-rejected' happens after a completed upload and must not stay silent.
export type AttachMobileFileResult = 'sent' | 'cancelled' | 'input-lease-dropped' | 'send-rejected'

// Uploads a picked attachment to the host and pastes the resulting file path into
// the active terminal — the same bracketed-path payload desktop image paste sends,
// so TUIs (Claude Code, etc.) attach it exactly as a desktop paste.
export async function attachMobileFileToTerminal(
  source: MobileAttachmentSource,
  {
    client,
    terminal,
    deviceToken,
    getConnectionId,
    pickAttachment,
    canAttachAnyFile,
    onUploadStart,
    beforeTerminalSend
  }: AttachMobileFileDeps
): Promise<AttachMobileFileResult> {
  const picked = await pickAttachment(source, {
    allowAnyFile: canAttachAnyFile === true,
    // Spinner must cover the base64 encode of large document picks, which
    // blocks the JS thread before the upload itself even starts.
    onWillReadFile: onUploadStart
  })
  if (!picked) {
    return 'cancelled'
  }
  onUploadStart?.()
  const connectionId = await getConnectionId()
  const imagePath = await saveMobileAttachmentAsTempFile(client, picked.base64, {
    connectionId,
    fileName: picked.fileName
  })
  // Why: a generated image path is terminal image injection, so it's always
  // bracketed (matching desktop paste) regardless of terminal mode.
  const payload = buildMobileImagePastePayload(imagePath)
  if (beforeTerminalSend && !(await beforeTerminalSend(terminal))) {
    return 'input-lease-dropped'
  }
  const response = await client.sendRequest('terminal.send', {
    terminal,
    text: payload,
    enter: false,
    ...(deviceToken ? { client: { id: deviceToken, type: 'mobile' as const } } : {})
  })
  return isTerminalSendRpcAccepted(response) ? 'sent' : 'send-rejected'
}
