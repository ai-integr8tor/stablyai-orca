import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { app } from 'electron'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import { assertClipboardImageByteLengthWithinLimit } from '../../shared/clipboard-image'

export type SaveClipboardImageAsTempFileArgs = {
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  fileName?: string | null
}

const REMOTE_CLIPBOARD_IMAGE_TEMP_DIR = '/tmp'
const ATTACHMENT_FILE_NAME_MAX_CHARS = 80

// Why: the phone-supplied name is untrusted input; strip anything that could
// escape the temp dir, hide the file, or fail the write on any supported host
// platform (Windows rejects <>:"|?* and silently drops trailing dots/spaces).
export function sanitizeAttachmentFileName(fileName: string): string | null {
  const cleaned = fileName
    .replace(/[/\\<>:"|?*]/g, '')
    // eslint-disable-next-line no-control-regex -- intentional control-char strip
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
  if (!cleaned) {
    return null
  }
  if (cleaned.length <= ATTACHMENT_FILE_NAME_MAX_CHARS) {
    return cleaned
  }
  const extension = path.posix.extname(cleaned)
  if (extension && extension.length < ATTACHMENT_FILE_NAME_MAX_CHARS) {
    return cleaned.slice(0, ATTACHMENT_FILE_NAME_MAX_CHARS - extension.length) + extension
  }
  return cleaned.slice(0, ATTACHMENT_FILE_NAME_MAX_CHARS)
}

function buildAttachmentTempFileName(originalFileName: string | null | undefined): string {
  if (originalFileName == null) {
    // Byte-identical to the historical clipboard-paste name for existing callers.
    return `orca-paste-${Date.now()}-${randomUUID()}.png`
  }
  const sanitized = sanitizeAttachmentFileName(originalFileName)
  const generated = `orca-file-${Date.now()}-${randomUUID()}`
  return sanitized ? `${generated}-${sanitized}` : generated
}

function joinRemotePath(basePath: string, fileName: string): string {
  if (isWindowsAbsolutePathLike(basePath)) {
    return path.win32.join(basePath, fileName)
  }
  return path.posix.join(basePath, fileName)
}

export async function saveClipboardImageBufferAsTempFile(
  buffer: Buffer,
  args?: SaveClipboardImageAsTempFileArgs
): Promise<string> {
  assertClipboardImageByteLengthWithinLimit(buffer.byteLength)

  const fileName = buildAttachmentTempFileName(args?.fileName)

  if (args?.connectionId) {
    const provider = requireSshFilesystemProvider(args.connectionId)
    const remoteTempDir = (await provider.getTempDir?.()) ?? REMOTE_CLIPBOARD_IMAGE_TEMP_DIR
    const remotePath = joinRemotePath(remoteTempDir, fileName)
    // Why: SSH terminal agents run on the remote host, so the pasted path must
    // name a remote file. The provider's base64 path writes binary bytes via SFTP.
    await provider.writeFileBase64(remotePath, buffer.toString('base64'))
    return remotePath
  }

  const tempPath = path.join(app.getPath('temp'), fileName)
  await fs.writeFile(tempPath, buffer)
  return tempPath
}
