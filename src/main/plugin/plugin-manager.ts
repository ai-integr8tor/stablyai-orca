// The Plugin Manager: host authority for discovery, local install, and
// persisted install/activation state. Composes the store, discovery, and
// install modules. Electron-free and fully injectable (pluginsDir +
// stateFilePath) so it unit-tests against temp dirs.
//
// Deferred to later units (kept out so nothing here is half-wired): the
// `orca-plugin://` asset protocol + webview-partition lifecycle (Electron-
// coupled), the trusted child-process runtime, and the IPC/relay bridges. Those
// subscribe to the activation state this manager owns.

import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PluginStore, type PluginInstallSource, type PluginStateEntry } from './plugin-store'
import { discoverPlugins, type DiscoveryResult } from './plugin-discovery'
import { installFromLocalFolder, type InstallResult } from './plugin-install'

export type PluginManagerConfig = {
  pluginsDir: string
  stateFilePath: string
}

export class PluginManager {
  private readonly store: PluginStore

  constructor(private readonly config: PluginManagerConfig) {
    this.store = new PluginStore(config.stateFilePath)
  }

  list(): PluginStateEntry[] {
    return this.store.list()
  }

  get(id: string): PluginStateEntry | undefined {
    return this.store.get(id)
  }

  // Scan the plugins directory for installed bundles and their manifest state.
  discover(): DiscoveryResult {
    return discoverPlugins(this.config.pluginsDir)
  }

  // Record a plugin whose files were already placed in pluginsDir by an external
  // installer (e.g. resolveAndInstall for registry/git/tarball sources).
  recordInstalled(entry: { id: string; version: string; source: PluginInstallSource }): void {
    this.store.recordInstalled(entry)
  }

  // Install from a local folder and record it (inactive) in the store.
  installLocal(sourceDir: string): InstallResult {
    const result = installFromLocalFolder(sourceDir, this.config.pluginsDir)
    if (!result.ok) {
      return result
    }
    try {
      this.store.recordInstalled({
        id: result.id,
        version: result.version,
        source: { kind: 'local', path: sourceDir }
      })
    } catch (error) {
      // State write failed — remove the copied dir so we never leave an
      // installed-but-unrecorded plugin behind.
      rmSync(join(this.config.pluginsDir, result.id), { recursive: true, force: true })
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
    }
    return result
  }

  // Idempotent: returns true only when the plugin existed and flipped to active.
  activate(id: string): boolean {
    if (!this.store.get(id)) {
      return false
    }
    return this.store.setActive(id, true)
  }

  // Idempotent: returns true only when the plugin existed and flipped to inactive.
  deactivate(id: string): boolean {
    if (!this.store.get(id)) {
      return false
    }
    return this.store.setActive(id, false)
  }

  // Deactivate (idempotent) then delete the plugin directory and state entry.
  remove(id: string): boolean {
    if (!this.store.get(id)) {
      return false
    }
    this.store.setActive(id, false)
    const dir = join(this.config.pluginsDir, id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
    return this.store.remove(id)
  }
}
