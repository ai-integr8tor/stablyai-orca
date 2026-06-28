// Persisted install/activation state for plugins — the host's source of truth
// (authority lives in main; renderer/mobile rebuild from this). Injectable
// state-file path so it unit-tests against a temp dir with no Electron.
//
// Activation state is not a secret, so it is written as plain JSON; secret-
// bearing stores (plugin settings that may hold tokens) use the secure-file /
// Windows-ACL path in a later unit.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Where a plugin came from. Mirrors the install module's PluginSource shape
// (kept local to avoid coupling the store to the installer).
export type PluginInstallSource =
  | { kind: 'local'; path: string }
  | { kind: 'registry'; name: string; version: string | null }
  | { kind: 'git'; url: string }
  | { kind: 'tarball'; url: string }

export type PluginStateEntry = {
  id: string
  version: string
  source: PluginInstallSource
  active: boolean
  installedAt: string
}

type PersistedState = { version: 1; plugins: Record<string, PluginStateEntry> }

// Fresh empty state with a null-prototype plugins map so a plugin id used as a
// key can never reach Object.prototype (prototype-pollution defense-in-depth;
// ids are also validated safe at the manifest boundary).
function emptyState(): PersistedState {
  return { version: 1, plugins: Object.create(null) as Record<string, PluginStateEntry> }
}

// A persisted entry must carry the fields list()/get() consumers rely on; a
// hand-edited or partial state file is filtered rather than trusted wholesale.
function isValidEntry(value: unknown): value is PluginStateEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.version === 'string' &&
    typeof entry.active === 'boolean'
  )
}

export class PluginStore {
  private state: PersistedState

  constructor(private readonly stateFilePath: string) {
    this.state = this.load()
  }

  private load(): PersistedState {
    try {
      if (!existsSync(this.stateFilePath)) {
        return emptyState()
      }
      const parsed: unknown = JSON.parse(readFileSync(this.stateFilePath, 'utf8'))
      const parsedPlugins =
        parsed && typeof parsed === 'object' ? (parsed as PersistedState).plugins : undefined
      if (parsedPlugins && typeof parsedPlugins === 'object') {
        const state = emptyState()
        // Copy only well-formed entries into the null-prototype map.
        for (const [id, entry] of Object.entries(parsedPlugins)) {
          if (isValidEntry(entry)) {
            state.plugins[id] = entry
          }
        }
        return state
      }
    } catch {
      // Corrupt/unreadable state resets to empty rather than crashing the host.
    }
    return emptyState()
  }

  // Atomic write: stage to a temp file then rename, so a crash mid-write never
  // truncates the live state file (which load() would then silently reset).
  private persist(): void {
    mkdirSync(dirname(this.stateFilePath), { recursive: true })
    const tmp = `${this.stateFilePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8')
    renameSync(tmp, this.stateFilePath)
  }

  list(): PluginStateEntry[] {
    return Object.values(this.state.plugins)
  }

  get(id: string): PluginStateEntry | undefined {
    return this.state.plugins[id]
  }

  // Record (or refresh) an installed plugin. A reinstall preserves the prior
  // active flag; a first install lands inactive.
  recordInstalled(
    entry: Omit<PluginStateEntry, 'active' | 'installedAt'> & { installedAt?: string }
  ): PluginStateEntry {
    const prior = this.state.plugins[entry.id]
    const stored: PluginStateEntry = {
      id: entry.id,
      version: entry.version,
      source: entry.source,
      active: prior?.active ?? false,
      installedAt: prior?.installedAt ?? entry.installedAt ?? new Date().toISOString()
    }
    this.state.plugins[entry.id] = stored
    try {
      this.persist()
    } catch (error) {
      // Roll back the in-memory mutation so memory and disk never diverge.
      if (prior) {
        this.state.plugins[entry.id] = prior
      } else {
        delete this.state.plugins[entry.id]
      }
      throw error
    }
    return stored
  }

  // Idempotent: returns true when the active flag actually changed.
  setActive(id: string, active: boolean): boolean {
    const entry = this.state.plugins[id]
    if (!entry || entry.active === active) {
      return false
    }
    const previous = entry.active
    entry.active = active
    try {
      this.persist()
    } catch {
      entry.active = previous
      return false
    }
    return true
  }

  remove(id: string): boolean {
    const removed = this.state.plugins[id]
    if (!removed) {
      return false
    }
    delete this.state.plugins[id]
    try {
      this.persist()
    } catch {
      this.state.plugins[id] = removed
      return false
    }
    return true
  }
}
