// Serializable plugin bundle for provisioning a plugin to the relay host. A
// bundle is a flat file list (each file's bytes base64-encoded) plus a sha256
// integrity digest over a canonical serialization. Electron-free and dependency
// -free (reuses the installer's sha256); the desktop packages it, the relay
// verifies + unpacks it. Lives beside install-integrity (node:crypto), not in
// src/shared, so node-only code stays out of the web typecheck graph.

import { sha256 } from './install/install-integrity'

// Generous ceiling for a self-contained v1 plugin (manifest + main.js + one
// inlined HTML UI). Bounds an abusive transfer over the wire; asserted on both
// the package and receive ends.
export const PLUGIN_BUNDLE_MAX_BYTES = 4 * 1024 * 1024
// Bound the file count too — the byte cap alone lets a flood of tiny files
// exhaust inodes/syscalls on the relay host.
export const PLUGIN_BUNDLE_MAX_FILES = 1000

export type PluginBundleFile = { path: string; dataBase64: string }
export type PluginBundle = { pluginId: string; files: PluginBundleFile[]; integrity: string }

export type VerifyBundleResult =
  | { ok: true; files: PluginBundleFile[] }
  | { ok: false; error: string }

// A bundle file path must be relative, posix-separated, and stay inside the
// plugin dir: no absolute paths, no drive letters, no backslashes, no empty / `.`
// / `..` segments, and no control characters. The relay re-checks this before
// writing — never trust the sender's paths.
export function isSafeBundlePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false
  }
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\')) {
    return false
  }
  // Reject control chars (newline/CR/tab/NUL/DEL). A newline in a path could
  // straddle the integrity canonicalization's `\n` separators (digest collision),
  // and embedded control chars are invalid filenames.
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return false
    }
  }
  return !path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')
}

// Canonical serialization for the integrity digest: files sorted by path, each
// rendered as `path\n<base64>`, joined by newlines. Order-independent so the
// digest is stable regardless of how the file list was assembled. Path control
// chars (which could straddle the separators) are rejected by isSafeBundlePath.
function canonicalize(files: PluginBundleFile[]): string {
  return [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\n${f.dataBase64}`)
    .join('\n')
}

export function serializePluginBundle(pluginId: string, files: PluginBundleFile[]): PluginBundle {
  return { pluginId, files, integrity: sha256(canonicalize(files)) }
}

// Validate a received bundle: shape, file count, per-file path safety, total
// decoded byte cap, and integrity. Returns the files on success so the caller
// writes only a verified set.
export function verifyPluginBundle(bundle: unknown): VerifyBundleResult {
  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, error: 'invalid_bundle' }
  }
  const candidate = bundle as Partial<PluginBundle>
  if (
    typeof candidate.pluginId !== 'string' ||
    !Array.isArray(candidate.files) ||
    typeof candidate.integrity !== 'string'
  ) {
    return { ok: false, error: 'invalid_bundle' }
  }
  if (candidate.files.length > PLUGIN_BUNDLE_MAX_FILES) {
    return { ok: false, error: 'too_many_files' }
  }
  let totalBytes = 0
  for (const file of candidate.files) {
    if (
      !file ||
      typeof file !== 'object' ||
      typeof (file as PluginBundleFile).path !== 'string' ||
      typeof (file as PluginBundleFile).dataBase64 !== 'string'
    ) {
      return { ok: false, error: 'invalid_file_entry' }
    }
    if (!isSafeBundlePath((file as PluginBundleFile).path)) {
      return { ok: false, error: 'unsafe_path' }
    }
    totalBytes += Buffer.from((file as PluginBundleFile).dataBase64, 'base64').length
  }
  if (totalBytes > PLUGIN_BUNDLE_MAX_BYTES) {
    return { ok: false, error: 'too_large' }
  }
  const files = candidate.files as PluginBundleFile[]
  if (sha256(canonicalize(files)) !== candidate.integrity) {
    return { ok: false, error: 'integrity_mismatch' }
  }
  return { ok: true, files }
}
