// Orchestrates multi-source install WITHOUT new production deps: fetch adapters
// are injected (real impls use node:https + system `git`/`tar`, no arborist/
// pacote). Flow per source: fetch into a staging dir, validate the manifest,
// pin integrity (registry/tarball), then place at pluginsDir/<id> and update the
// lockfile. v1 installs self-contained plugins (transitive npm dep resolution
// is a follow-up; the example ships dependency-free).

import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readManifestRaw } from '../plugin-discovery'
import { validatePluginManifest } from '../../../shared/plugin/manifest-validate'
import { isSafePluginId } from '../../../shared/plugin/manifest'
import type { PluginSource } from './install-source'
import {
  checkAgainstLock,
  isSecureRemoteUrl,
  sha256,
  upsertLock,
  type PluginLockfile
} from './install-integrity'

export type InstallAdapters = {
  // Resolve + download a registry tarball; returns the resolved version + bytes.
  fetchRegistryTarball(
    name: string,
    version: string | null
  ): Promise<{ bytes: Buffer; version: string }>
  fetchTarball(url: string): Promise<Buffer>
  extractTarball(bytes: Buffer, destDir: string): Promise<void>
  // Clone (shallow, pinned) into destDir and return the resolved commit SHA.
  cloneGit(url: string, destDir: string): Promise<{ commit: string }>
}

export type ResolveInstallResult =
  | { ok: true; id: string; version: string; lockfile: PluginLockfile }
  | { ok: false; errors: string[] }

export async function resolveAndInstall(
  source: PluginSource,
  opts: {
    pluginsDir: string
    stagingDir: string
    adapters: InstallAdapters
    lockfile: PluginLockfile
  }
): Promise<ResolveInstallResult> {
  const { pluginsDir, stagingDir, adapters, lockfile } = opts
  rmSync(stagingDir, { recursive: true, force: true })

  let integrity: string | null = null
  let resolvedVersion: string | null = null
  // Retained for the reinstall integrity check below (bytes-addressable sources).
  let fetchedBytes: Buffer | null = null

  try {
    switch (source.kind) {
      case 'local':
        if (!existsSync(source.path)) {
          return { ok: false, errors: [`source folder does not exist: ${source.path}`] }
        }
        cpSync(source.path, stagingDir, { recursive: true })
        break
      case 'registry': {
        const { bytes, version } = await adapters.fetchRegistryTarball(source.name, source.version)
        integrity = sha256(bytes)
        resolvedVersion = version
        fetchedBytes = bytes
        await adapters.extractTarball(bytes, stagingDir)
        break
      }
      case 'tarball': {
        if (!isSecureRemoteUrl(source.url)) {
          return { ok: false, errors: ['tarball URL must be https://'] }
        }
        const bytes = await adapters.fetchTarball(source.url)
        integrity = sha256(bytes)
        fetchedBytes = bytes
        await adapters.extractTarball(bytes, stagingDir)
        break
      }
      case 'git': {
        const { commit } = await adapters.cloneGit(source.url, stagingDir)
        integrity = `git-${commit}`
        break
      }
    }
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true })
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }

  const validated = validatePluginManifest(readManifestRaw(stagingDir))
  if (!validated.ok) {
    rmSync(stagingDir, { recursive: true, force: true })
    return { ok: false, errors: validated.errors }
  }
  const manifest = validated.manifest
  // Defense in depth — validation already enforces id safety, but the dir name
  // is derived from it, so re-check before any filesystem placement.
  if (!isSafePluginId(manifest.id)) {
    rmSync(stagingDir, { recursive: true, force: true })
    return { ok: false, errors: [`unsafe plugin id: ${manifest.id}`] }
  }

  // Reinstall integrity: for a bytes-addressable source at the SAME locked
  // version, the freshly fetched bytes must match the pinned integrity, so a
  // compromised registry can't swap in different bytes under a known version.
  // A different version is a legitimate upgrade and skips the check.
  const lockedEntry = lockfile.plugins[manifest.id]
  const installedVersion = resolvedVersion ?? manifest.version
  if (fetchedBytes && lockedEntry && installedVersion === lockedEntry.version) {
    const verdict = checkAgainstLock(lockfile, manifest.id, fetchedBytes)
    if (!verdict.ok) {
      rmSync(stagingDir, { recursive: true, force: true })
      return { ok: false, errors: [verdict.reason] }
    }
  }

  const dest = join(pluginsDir, manifest.id)
  rmSync(dest, { recursive: true, force: true })
  cpSync(stagingDir, dest, { recursive: true })
  rmSync(stagingDir, { recursive: true, force: true })

  const nextLock = upsertLock(lockfile, {
    id: manifest.id,
    version: resolvedVersion ?? manifest.version,
    source,
    integrity: integrity ?? sha256(`${manifest.id}@${manifest.version}`)
  })
  return {
    ok: true,
    id: manifest.id,
    version: resolvedVersion ?? manifest.version,
    lockfile: nextLock
  }
}
