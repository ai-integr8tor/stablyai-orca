// Discover installed plugins under a plugins directory: read each plugin's
// manifest (`plugin.json`, or the `orca` field of `package.json`) and validate
// it against the shared contract. Pure fs + the shared validator — no Electron.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { validatePluginManifest } from '../../shared/plugin/manifest-validate'
import type { PluginManifest } from '../../shared/plugin/manifest'

// Read the raw manifest object from a plugin directory, or null when neither a
// `plugin.json` nor a `package.json#orca` field is present / parseable.
export function readManifestRaw(pluginDir: string): unknown | null {
  const pluginJson = join(pluginDir, 'plugin.json')
  if (existsSync(pluginJson)) {
    try {
      return JSON.parse(readFileSync(pluginJson, 'utf8'))
    } catch {
      return null
    }
  }
  const packageJson = join(pluginDir, 'package.json')
  if (existsSync(packageJson)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJson, 'utf8')) as { orca?: unknown }
      return parsed.orca ?? null
    } catch {
      return null
    }
  }
  return null
}

export type DiscoveredPlugin = { dir: string; manifest: PluginManifest }
export type InvalidPlugin = { dir: string; errors: string[] }
export type DiscoveryResult = { valid: DiscoveredPlugin[]; invalid: InvalidPlugin[] }

export function discoverPlugins(pluginsDir: string): DiscoveryResult {
  const result: DiscoveryResult = { valid: [], invalid: [] }
  if (!existsSync(pluginsDir)) {
    return result
  }
  for (const name of readdirSync(pluginsDir)) {
    const dir = join(pluginsDir, name)
    let isDirectory = false
    try {
      isDirectory = statSync(dir).isDirectory()
    } catch {
      // A dangling symlink (ENOENT) or unreadable entry (EACCES) must not abort
      // the whole scan — skip it.
      continue
    }
    if (!isDirectory) {
      continue
    }
    const raw = readManifestRaw(dir)
    if (raw === null) {
      result.invalid.push({ dir, errors: ['no plugin.json or package.json#orca manifest found'] })
      continue
    }
    const validated = validatePluginManifest(raw)
    if (validated.ok) {
      result.valid.push({ dir, manifest: validated.manifest })
    } else {
      result.invalid.push({ dir, errors: validated.errors })
    }
  }
  return result
}
