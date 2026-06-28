// Relay-side receipt of a provisioned plugin bundle: verify integrity + paths
// (shared codec), stage the files to a temp dir, validate the embedded manifest
// and id, then atomically swap into relayPluginsDir()/<id>. Electron-free.
// Nothing is written unless every check passes; a partial stage is cleaned up,
// and a failed swap restores any prior install rather than losing it.

import { basename, dirname, join } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isSafePluginId } from '../shared/plugin/manifest'
import { validatePluginManifest } from '../shared/plugin/manifest-validate'
import { readManifestRaw } from '../main/plugin/plugin-discovery'
import { verifyPluginBundle, type PluginBundle } from '../main/plugin/plugin-bundle'

export type ProvisionResult = { ok: true } | { ok: false; error: string }
export type ProvisionConfig = { pluginsDir: string; stagingDir: string }

export function provisionPlugin(bundle: unknown, config: ProvisionConfig): ProvisionResult {
  const verified = verifyPluginBundle(bundle)
  if (!verified.ok) {
    return { ok: false, error: verified.error }
  }
  const pluginId = (bundle as PluginBundle).pluginId
  // Reject an unsafe id before touching the filesystem.
  if (!isSafePluginId(pluginId)) {
    return { ok: false, error: 'unsafe_plugin_id' }
  }

  // Staging-dir creation can itself fail (EACCES/ENOSPC/EROFS); keep it inside
  // the result contract rather than throwing out of the handler.
  let staged: string
  try {
    mkdirSync(config.stagingDir, { recursive: true })
    staged = mkdtempSync(join(config.stagingDir, `${pluginId}-`))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'staging_failed' }
  }

  try {
    for (const file of verified.files) {
      // Reconstruct from posix segments via native join so a Windows relay host
      // writes platform-correct paths (the wire format is always posix `/`).
      const target = join(staged, ...file.path.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, Buffer.from(file.dataBase64, 'base64'))
    }
    // Reuse the canonical manifest read (plugin.json or package.json#orca) +
    // validation rather than re-parsing, so the relay and installer agree.
    const raw = readManifestRaw(staged)
    if (raw === null) {
      return fail(staged, 'missing_manifest')
    }
    const validated = validatePluginManifest(raw)
    if (!validated.ok) {
      return fail(staged, 'invalid_manifest')
    }
    if (validated.manifest.id !== pluginId) {
      return fail(staged, 'manifest_id_mismatch')
    }
    mkdirSync(config.pluginsDir, { recursive: true })
    return commitStaged(staged, join(config.pluginsDir, pluginId))
  } catch (error) {
    return fail(staged, error instanceof Error ? error.message : 'write_failed')
  }
}

// Swap the fully-staged dir into place without a destructive window: move any
// prior install aside first, so a failed rename (cross-volume EXDEV, a racing
// re-provision) restores the prior plugin instead of leaving it missing.
function commitStaged(staged: string, dest: string): ProvisionResult {
  const backup = `${dest}.bak-${basename(staged)}`
  const hadPrior = existsSync(dest)
  if (hadPrior) {
    renameSync(dest, backup)
  }
  try {
    renameSync(staged, dest)
  } catch (error) {
    if (hadPrior) {
      renameSync(backup, dest)
    }
    rmSync(staged, { recursive: true, force: true })
    return { ok: false, error: error instanceof Error ? error.message : 'commit_failed' }
  }
  if (hadPrior) {
    rmSync(backup, { recursive: true, force: true })
  }
  return { ok: true }
}

function fail(staged: string, error: string): ProvisionResult {
  rmSync(staged, { recursive: true, force: true })
  return { ok: false, error }
}
