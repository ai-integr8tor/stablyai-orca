// The plugin <-> host API contract: the message protocol, the typed `context`
// surface authors program against, the bounded workspace snapshot, the host
// command allowlist, and the lifecycle/event names. Shared by main, the relay,
// and the SDK so client and host cannot drift.
//
// Every host-backed accessor is async (Promise-returning): each call crosses a
// process boundary (child IPC) and, on mobile, an SSH relay hop. A synchronous
// signature could not be backed by the remote transport.

import type { PluginCapability } from './manifest'

// Bounded workspace data a plugin may read via `workspace:read`. Deliberately
// excludes filesystem paths, remotes, and credentials — a plugin that needs
// more uses raw Node (which the trusted-runtime consent already covers).
export type WorkspaceSnapshot = {
  workspaceName: string
  currentBranch: string | null
  isDirty: boolean
  openFileCount: number
}

// The keys a projected snapshot is allowed to contain. Used by the gate's
// projection to strip anything else a host service might hand it.
export const WORKSPACE_SNAPSHOT_KEYS = [
  'workspaceName',
  'currentBranch',
  'isDirty',
  'openFileCount'
] as const satisfies readonly (keyof WorkspaceSnapshot)[]

// Allowlisted host commands a plugin may invoke via `context.commands.invokeHost`.
export const HOST_COMMANDS = ['open-external-url', 'copy-to-clipboard'] as const
export type HostCommand = (typeof HOST_COMMANDS)[number]

export function isHostCommand(value: unknown): value is HostCommand {
  return typeof value === 'string' && (HOST_COMMANDS as readonly string[]).includes(value)
}

// Host -> plugin lifecycle/event names the backend can subscribe to.
export const LIFECYCLE_EVENTS = [
  'onWorkspaceChanged',
  'onBranchChanged',
  'onSettingsChanged',
  'onPanelVisible',
  'onDeactivate'
] as const
export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number]

export function isLifecycleEvent(value: unknown): value is LifecycleEvent {
  return typeof value === 'string' && (LIFECYCLE_EVENTS as readonly string[]).includes(value)
}

// Bridge methods the plugin backend may call on the host, each gated by a
// declared capability. `satisfies` keeps the capability map exhaustive.
export const BRIDGE_METHODS = [
  'workspace.getSnapshot',
  'commands.invokeHost',
  'settings.get',
  'settings.set'
] as const
export type BridgeMethod = (typeof BRIDGE_METHODS)[number]

export function isBridgeMethod(value: unknown): value is BridgeMethod {
  return typeof value === 'string' && (BRIDGE_METHODS as readonly string[]).includes(value)
}

export const BRIDGE_METHOD_CAPABILITY = {
  'workspace.getSnapshot': 'workspace:read',
  'commands.invokeHost': 'commands',
  'settings.get': 'settings',
  'settings.set': 'settings'
} satisfies Record<BridgeMethod, PluginCapability>

// Wire envelope. `pluginId` is never carried here — the host derives it from
// the authenticated sender (webContents / child process / paired relay client).
export type BridgeRequest = {
  reqId: string
  method: BridgeMethod
  params?: unknown
}

export type BridgeErrorCode =
  | 'capability_denied'
  | 'unknown_method'
  | 'unknown_plugin'
  | 'invalid_params'
  | 'internal'

export type BridgeResponse =
  | { reqId: string; ok: true; result: unknown }
  | { reqId: string; ok: false; error: BridgeErrorCode }

// A subscription handle returned by `onDidChange`/event subscriptions.
export type Disposable = {
  dispose(): void
}

// The typed surface a plugin backend programs against. All host-backed reads
// are async; `register`/`on*`/`postMessage` are local and synchronous.
export type PluginContext = {
  workspace: {
    getSnapshot(): Promise<WorkspaceSnapshot>
    onDidChange(cb: () => void): Disposable
  }
  commands: {
    register(id: string, handler: (...args: unknown[]) => unknown): Disposable
    invokeHost(name: HostCommand, params?: unknown): Promise<unknown>
  }
  settings: {
    get<T = unknown>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
    onDidChange(cb: () => void): Disposable
  }
  ui: {
    postMessage(message: unknown): void
    onMessage(cb: (message: unknown) => void): Disposable
  }
  events: Record<LifecycleEvent, (cb: (payload?: unknown) => void) => Disposable>
  log: (...args: unknown[]) => void
  subscriptions: Disposable[]
}
