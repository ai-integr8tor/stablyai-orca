// Host-side orchestrator that actually runs plugins: ties the manager, the
// per-plugin child process (PluginHost), the capability-gated host handler, the
// per-plugin settings store, output capture, and the crash/restart supervisor
// together. The PluginHost factory and the restart timer are injectable so the
// orchestration is unit-testable without forking real processes.

import { join } from 'node:path'
import type { PluginManager } from './plugin-manager'
import { PluginHost, type PluginHostConfig } from './plugin-host-process'
import { PluginSupervisor } from './plugin-supervision'
import { PluginOutputBuffer, type OutputLine } from './plugin-output-buffer'
import { PluginSettingsStore } from './plugin-settings-store'
import { createHostRequestHandler } from './plugin-host-handler'
import { readManifestRaw } from './plugin-discovery'
import { validatePluginManifest } from '../../shared/plugin/manifest-validate'
import type { HostCommand, WorkspaceSnapshot } from '../../shared/plugin/api-contract'

// The subset of PluginHost the runtime depends on (injectable for tests).
export type PluginHostLike = {
  start(): Promise<void>
  stop(graceMs?: number): Promise<void>
  isRunning(): boolean
  postUi(message: unknown): void
  // Synchronous best-effort kill for process-exit cleanup (no await available).
  terminate(): void
}

export type PluginHostFactory = (config: PluginHostConfig) => PluginHostLike

export type PluginRuntimeConfig = {
  manager: PluginManager
  pluginsDir: string
  // Path to the built plugin-host-entry script the child runs.
  entryPath: string
  // Extra fork env (e.g. { ELECTRON_RUN_AS_NODE: '1' }) in production.
  forkEnv?: NodeJS.ProcessEnv
  getWorkspaceSnapshot: () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>
  invokeCommand: (name: HostCommand, params: unknown) => Promise<unknown>
  onUiMessage?: (pluginId: string, message: unknown) => void
  // Injectable for tests.
  hostFactory?: PluginHostFactory
  scheduleRestart?: (ms: number, run: () => void) => void
}

export type ActivateResult = { ok: true } | { ok: false; error: string }

type Running = { host: PluginHostLike; output: PluginOutputBuffer }

export class PluginRuntime {
  private readonly running = new Map<string, Running>()
  private readonly supervisor = new PluginSupervisor()
  private readonly factory: PluginHostFactory
  private readonly schedule: (ms: number, run: () => void) => void

  constructor(private readonly config: PluginRuntimeConfig) {
    this.factory = config.hostFactory ?? ((c) => new PluginHost(c))
    this.schedule =
      config.scheduleRestart ??
      ((ms, run) => {
        setTimeout(run, ms).unref?.()
      })
  }

  isRunning(pluginId: string): boolean {
    return this.running.get(pluginId)?.host.isRunning() ?? false
  }

  state(pluginId: string): 'inactive' | 'running' | 'errored' {
    return this.supervisor.getState(pluginId)
  }

  getOutput(pluginId: string): OutputLine[] {
    return this.running.get(pluginId)?.output.snapshot() ?? []
  }

  // Load the plugin's manifest, spawn its backend wired to the gated handler,
  // and mark it active. Idempotent while running. A fresh (user) activation
  // resets the crash budget; a supervisor-driven restart (isRestart) keeps the
  // accumulating count so the maxRestarts cap is actually reached.
  async activate(pluginId: string, options: { isRestart?: boolean } = {}): Promise<ActivateResult> {
    if (this.running.has(pluginId)) {
      return { ok: true }
    }
    const dir = join(this.config.pluginsDir, pluginId)
    const validated = validatePluginManifest(readManifestRaw(dir))
    if (!validated.ok) {
      return { ok: false, error: `invalid manifest: ${validated.errors.join('; ')}` }
    }
    const manifest = validated.manifest
    const output = new PluginOutputBuffer()
    const handler = createHostRequestHandler(manifest.capabilities, {
      getWorkspaceSnapshot: this.config.getWorkspaceSnapshot,
      invokeCommand: this.config.invokeCommand,
      settings: new PluginSettingsStore(this.config.pluginsDir, pluginId, manifest.settingsSchema)
    })
    const host = this.factory({
      pluginId,
      pluginDir: dir,
      mainPath: join(dir, manifest.main),
      entryPath: this.config.entryPath,
      env: this.config.forkEnv,
      output,
      onHostRequest: handler,
      onUiMessage: (message) => this.config.onUiMessage?.(pluginId, message),
      onExit: (info) => this.handleExit(pluginId, info.expected)
    })
    this.running.set(pluginId, { host, output })
    this.supervisor.markRunning(pluginId, { resetRestarts: !options.isRestart })
    try {
      await host.start()
    } catch (error) {
      // A failed start() can leave the forked child alive (it reported
      // activate-error without exiting); terminate it so it isn't orphaned.
      // terminate() marks the stop expected, so the child's exit event won't
      // double-drive the supervisor — the handleExit below records the failure.
      host.terminate()
      this.running.delete(pluginId)
      this.handleExit(pluginId, false)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    this.config.manager.activate(pluginId)
    return { ok: true }
  }

  async deactivate(pluginId: string): Promise<void> {
    const entry = this.running.get(pluginId)
    this.running.delete(pluginId)
    this.supervisor.reset(pluginId)
    if (entry) {
      await entry.host.stop()
    }
    this.config.manager.deactivate(pluginId)
  }

  postUi(pluginId: string, message: unknown): void {
    this.running.get(pluginId)?.host.postUi(message)
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.running.keys()].map((id) => this.deactivate(id)))
  }

  // Synchronously terminate every running backend. For process-exit cleanup
  // where there is no event loop left to await stopAll() — the SIGTERM must be
  // delivered inline or the children are orphaned.
  stopAllSync(): void {
    for (const [, entry] of this.running) {
      entry.host.terminate()
    }
    this.running.clear()
  }

  // A backend exited. A host-initiated stop is expected (no restart); a crash
  // consults the supervisor for a bounded backoff restart, else marks Errored.
  private handleExit(pluginId: string, expected: boolean): void {
    if (expected) {
      return
    }
    this.running.delete(pluginId)
    const decision = this.supervisor.markExited(pluginId, { crashed: true })
    if (decision.restart) {
      this.schedule(decision.delayMs, () => {
        // Only restart if it was not deactivated in the meantime.
        if (this.config.manager.get(pluginId)?.active && !this.running.has(pluginId)) {
          void this.activate(pluginId, { isRestart: true })
        }
      })
    }
  }
}
