// Per-plugin settings persistence (U13). Each plugin's settings live in their
// OWN file — `<pluginsDir>/<id>/settings.json` — not a shared namespaced blob,
// so one plugin's settings path can never resolve into another's. Writes are
// validated against the manifest's `settingsSchema` when present.
//
// Cross-plugin READ of another plugin's file is possible by design (plugins are
// trusted, with full Node access) — documented in the security notes; users
// should not store cross-sensitive secrets in plugin settings.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { validateAgainstSchema, type SchemaValidation } from '../../shared/plugin/settings-schema'
import { isSafePluginId } from '../../shared/plugin/manifest'

// Re-exported for callers that path-build by id; the canonical safe-id check
// lives at the manifest trust boundary in src/shared/plugin/manifest.ts.
export { isSafePluginId }

export function pluginSettingsPath(pluginsDir: string, id: string): string {
  if (!isSafePluginId(id)) {
    throw new Error(`unsafe plugin id: ${id}`)
  }
  return join(pluginsDir, id, 'settings.json')
}

export type SettingsWriteResult = { ok: true } | { ok: false; errors: string[] }

export class PluginSettingsStore {
  private readonly filePath: string

  constructor(
    pluginsDir: string,
    pluginId: string,
    private readonly settingsSchema?: Record<string, unknown>
  ) {
    this.filePath = pluginSettingsPath(pluginsDir, pluginId)
  }

  private read(): Record<string, unknown> {
    try {
      if (!existsSync(this.filePath)) {
        return {}
      }
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Corrupt settings reset to empty rather than crashing the plugin host.
    }
    return {}
  }

  // Atomic write: stage to a temp file then rename, so a crash mid-write never
  // truncates the live settings file (which read() would then silently reset).
  private write(settings: Record<string, unknown>): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
    renameSync(tmp, this.filePath)
  }

  getAll(): Record<string, unknown> {
    return this.read()
  }

  get<T = unknown>(key: string): T | undefined {
    return this.read()[key] as T | undefined
  }

  // Apply the change, validate the RESULTING object against the schema (when
  // present), and persist only if valid. Invalid writes leave the file untouched.
  set(key: string, value: unknown): SettingsWriteResult {
    const next = { ...this.read(), [key]: value }
    const validation = this.validate(next)
    if (!validation.ok) {
      return validation
    }
    try {
      this.write(next)
    } catch (error) {
      // Surface the disk error to the caller instead of throwing through the
      // host IPC handler; the live file is intact (atomic write).
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
    }
    return { ok: true }
  }

  delete(key: string): void {
    const current = this.read()
    if (!(key in current)) {
      return
    }
    delete current[key]
    this.write(current)
  }

  private validate(settings: Record<string, unknown>): SchemaValidation {
    if (!this.settingsSchema) {
      return { ok: true }
    }
    return validateAgainstSchema(settings, this.settingsSchema)
  }
}
