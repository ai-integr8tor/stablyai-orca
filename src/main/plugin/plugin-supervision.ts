// Crash/restart supervision policy for plugin backend processes — the pure
// decision half of the runtime (the real `child_process` fork is wired and
// integration-tested separately). Decides whether a plugin that exited should
// be restarted (with backoff) or marked Errored after too many crashes.
//
// Pure + deterministic: callers own the actual timers and spawning; this just
// tracks per-plugin state and returns decisions.

export type RunState = 'inactive' | 'running' | 'errored'

export type ExitInfo = {
  // Clean exit from a host-initiated deactivate vs. an unexpected crash.
  crashed: boolean
}

export type RestartDecision =
  | { restart: true; delayMs: number; attempt: number }
  | { restart: false; state: RunState }

export type SupervisionConfig = {
  // Max crash-restarts before a plugin is marked Errored. `0` means no restart
  // attempts — the first crash goes straight to Errored.
  maxRestarts: number
  // Backoff schedule indexed by attempt; the last entry is reused past its end.
  // Must be non-empty (enforced in the constructor).
  backoffMs: number[]
}

const DEFAULT_CONFIG: SupervisionConfig = {
  maxRestarts: 3,
  backoffMs: [500, 2000, 5000]
}

type Entry = { state: RunState; restarts: number }

export class PluginSupervisor {
  private readonly entries = new Map<string, Entry>()
  private readonly config: SupervisionConfig

  constructor(config: Partial<SupervisionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    // Guard misconfiguration: an empty backoff schedule would index [-1] →
    // undefined delay (immediate restart loop); a negative cap is meaningless.
    if (this.config.maxRestarts < 0) {
      throw new Error('SupervisionConfig.maxRestarts must be >= 0')
    }
    if (this.config.backoffMs.length === 0) {
      throw new Error('SupervisionConfig.backoffMs must be non-empty')
    }
  }

  getState(id: string): RunState {
    return this.entries.get(id)?.state ?? 'inactive'
  }

  restartCount(id: string): number {
    return this.entries.get(id)?.restarts ?? 0
  }

  // Mark a plugin as running. A fresh activation (not a restart) resets the
  // crash counter so a previously-flaky plugin gets a clean slate.
  markRunning(id: string, options: { resetRestarts?: boolean } = {}): void {
    const prior = this.entries.get(id)
    this.entries.set(id, {
      state: 'running',
      restarts: options.resetRestarts ? 0 : (prior?.restarts ?? 0)
    })
  }

  // Record that the process exited and decide what to do next.
  markExited(id: string, info: ExitInfo): RestartDecision {
    if (!info.crashed) {
      // Host-initiated stop: go inactive, clear restart history.
      this.entries.set(id, { state: 'inactive', restarts: 0 })
      return { restart: false, state: 'inactive' }
    }
    const entry = this.entries.get(id)
    // An exit for an untracked plugin is not a running crash to restart.
    if (!entry) {
      return { restart: false, state: 'inactive' }
    }
    if (entry.restarts >= this.config.maxRestarts) {
      this.entries.set(id, { state: 'errored', restarts: entry.restarts })
      return { restart: false, state: 'errored' }
    }
    const attempt = entry.restarts + 1
    const idx = Math.max(0, Math.min(entry.restarts, this.config.backoffMs.length - 1))
    this.entries.set(id, { state: 'running', restarts: attempt })
    return { restart: true, delayMs: this.config.backoffMs[idx], attempt }
  }

  // Clear all state for a plugin (e.g. on deactivate/remove or manual re-enable).
  reset(id: string): void {
    this.entries.delete(id)
  }
}
