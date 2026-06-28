// Integrity + lockfile primitives for plugin installs. Sources without registry
// provenance (git/tarball) are pinned by a SHA-256 of the fetched bytes; the
// lockfile records the resolved version + integrity so a reinstall verifies the
// bytes did not change. Pure + unit-tested (node:crypto only).

import { createHash } from 'node:crypto'
import type { PluginSource } from './install-source'

export function sha256(bytes: Buffer | string): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`
}

export function verifyIntegrity(bytes: Buffer | string, expected: string): boolean {
  return sha256(bytes) === expected
}

export type PluginLockEntry = {
  id: string
  version: string
  source: PluginSource
  integrity: string
}

export type PluginLockfile = { version: 1; plugins: Record<string, PluginLockEntry> }

export function emptyLockfile(): PluginLockfile {
  return { version: 1, plugins: {} }
}

export function upsertLock(lock: PluginLockfile, entry: PluginLockEntry): PluginLockfile {
  return { version: 1, plugins: { ...lock.plugins, [entry.id]: entry } }
}

// On reinstall, the freshly fetched bytes must match the locked integrity.
export function checkAgainstLock(
  lock: PluginLockfile,
  id: string,
  bytes: Buffer | string
): { ok: true } | { ok: false; reason: string } {
  const entry = lock.plugins[id]
  if (!entry) {
    return { ok: true } // first install — nothing to verify against
  }
  return verifyIntegrity(bytes, entry.integrity)
    ? { ok: true }
    : { ok: false, reason: `integrity mismatch for ${id} (locked ${entry.integrity})` }
}

// HTTPS-only guard for remote sources (reject http:// to avoid MITM on fetch).
export function isSecureRemoteUrl(url: string): boolean {
  return url.startsWith('https://')
}
