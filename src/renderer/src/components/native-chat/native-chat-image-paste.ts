// Pure decision layer for image paste. The composer persists a pasted image to
// a temp file (via the preload clipboard API) and then needs to know, per
// agent, whether that file can be sent as a TUI image attachment. Confirmed
// agents get a native attachment chip; unsupported/custom agents get a clear
// message instead of silently injecting a path that the model reads as text.

import type { AgentType } from '../../../../shared/agent-status-types'
import { getAgentImageHandling } from '../../../../shared/agent-image-handling'
import { isImageDropPath } from '../terminal-pane/terminal-drop-image-path'

export { getAgentImageHandling } from '../../../../shared/agent-image-handling'

export type ImagePasteResult =
  | { kind: 'attach'; path: string }
  | { kind: 'unsupported'; agent: AgentType }

/**
 * Given the agent and the temp-file path the image was written to, decide what
 * (if anything) to attach. Attachment-capable agents receive the path through
 * the same bracketed image-paste channel as the terminal TUI.
 */
export function resolveImagePaste(agent: AgentType, tempFilePath: string): ImagePasteResult {
  if (getAgentImageHandling(agent) === 'attachment') {
    return { kind: 'attach', path: tempFilePath }
  }
  return { kind: 'unsupported', agent }
}

export function isNativeChatImageAttachmentPath(path: string): boolean {
  return isImageDropPath(path)
}

/** True when a path is a clipboard-paste temp file (`orca-paste-<ts>-<uuid>.png`).
 *  Those names are noise in the UI, so the composer shows a friendly label
 *  instead of the basename. */
export function isNativeChatPastedImagePath(path: string): boolean {
  const base = path.split(/[\\/]/).findLast(Boolean) ?? path
  return /^orca-paste-.+\.png$/i.test(base)
}
