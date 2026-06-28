// Manages one plugin backend running as a forked Node child process (the
// trusted runtime). Mirrors the repo's existing child-process pattern
// (`src/main/computer/sidecar-client.ts`): in production the child is forked
// from Electron's own binary with ELECTRON_RUN_AS_NODE=1 and an entry resolved
// from app.asar.unpacked — both supplied via `entryPath` + `env` so this class
// stays Electron-free and unit/integration-testable by forking a plain-node
// fixture.
//
// Responsibilities: spawn, capture stdout/stderr into the output buffer, relay
// backend->host bridge requests to `onHostRequest` and send responses back,
// deliver host->backend messages, and stop gracefully (deactivate then kill).
// Crash/restart policy is owned by PluginSupervisor; this class reports exits.

import { fork, type ChildProcess } from 'node:child_process'
import type { BridgeRequest, BridgeResponse } from '../../shared/plugin/api-contract'
import type { HostToPlugin, PluginToHost } from './plugin-host-protocol'
import type { PluginOutputBuffer } from './plugin-output-buffer'

export type PluginExitInfo = {
  code: number | null
  signal: NodeJS.Signals | null
  // True when the exit followed a host-initiated stop() (not a crash).
  expected: boolean
}

export type PluginHostConfig = {
  pluginId: string
  pluginDir: string
  // Resolved path to the plugin's backend `main` module.
  mainPath: string
  // Path to the built plugin-host-entry script the child runs.
  entryPath: string
  // Extra env for the fork (e.g. { ELECTRON_RUN_AS_NODE: '1' } in production).
  env?: NodeJS.ProcessEnv
  output: PluginOutputBuffer
  // Backend -> host bridge calls (capability-gated by the caller).
  onHostRequest: (request: BridgeRequest) => Promise<BridgeResponse>
  // Backend -> UI messages (routed to the plugin's webview by the caller).
  onUiMessage?: (message: unknown) => void
  onExit?: (info: PluginExitInfo) => void
}

export class PluginHost {
  private child: ChildProcess | null = null
  private stopping = false
  private readyPromise: Promise<void> | null = null

  constructor(private readonly config: PluginHostConfig) {}

  // Fork the child and resolve once the backend's activate() completes (ready)
  // or reject if activation throws. Idempotent while running.
  start(): Promise<void> {
    if (this.child) {
      return this.readyPromise ?? Promise.resolve()
    }
    const child = fork(this.config.entryPath, [this.config.pluginId, this.config.mainPath], {
      cwd: this.config.pluginDir,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, ...this.config.env }
    })
    this.child = child
    this.stopping = false

    child.stdout?.on('data', (chunk: Buffer) =>
      this.config.output.append('stdout', chunk.toString())
    )
    child.stderr?.on('data', (chunk: Buffer) =>
      this.config.output.append('stderr', chunk.toString())
    )

    let resolveReady!: () => void
    let rejectReady!: (error: Error) => void
    this.readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })

    child.on('message', (raw: unknown) => {
      const message = raw as PluginToHost
      switch (message.type) {
        case 'ready':
          resolveReady()
          break
        case 'activate-error':
          rejectReady(new Error(message.message))
          break
        case 'host-request':
          void this.handleHostRequest(message.request)
          break
        case 'ui':
          this.config.onUiMessage?.(message.message)
          break
      }
    })

    child.on('error', (error: Error) => {
      this.config.output.append('stderr', `plugin host error: ${error.message}\n`)
    })

    child.on('exit', (code, signal) => {
      const expected = this.stopping
      this.child = null
      this.config.output.flush()
      // A crash before ready should reject the start() promise.
      rejectReady(
        new Error(`plugin backend exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
      )
      this.config.onExit?.({ code, signal, expected })
    })

    this.send({ type: 'activate' })
    return this.readyPromise
  }

  private async handleHostRequest(request: BridgeRequest): Promise<void> {
    const response = await this.config.onHostRequest(request)
    this.send({ type: 'host-response', response })
  }

  send(message: HostToPlugin): void {
    this.child?.send(message)
  }

  postUi(message: unknown): void {
    this.send({ type: 'ui', message })
  }

  isRunning(): boolean {
    return this.child !== null
  }

  // Synchronously signal the child to terminate. Unlike stop(), this returns
  // immediately without awaiting exit — for process-exit cleanup where there is
  // no event loop left to await on, so the kill signal must be delivered inline.
  terminate(): void {
    const child = this.child
    if (!child) {
      return
    }
    this.stopping = true
    child.kill('SIGTERM')
    this.child = null
  }

  // Ask the backend to deactivate, then force-kill if it does not exit within
  // the grace period.
  async stop(graceMs = 2000): Promise<void> {
    const child = this.child
    if (!child) {
      return
    }
    this.stopping = true
    this.send({ type: 'deactivate' })
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, graceMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    this.child = null
  }
}
