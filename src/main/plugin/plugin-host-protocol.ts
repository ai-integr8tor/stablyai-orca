// IPC message protocol between the plugin-host manager (parent, Electron main)
// and the forked plugin-host child that runs a plugin's trusted backend. Shared
// by `plugin-host-process.ts` (parent) and `plugin-host-entry.ts` (child) so the
// two sides cannot drift.

import type {
  BridgeRequest,
  BridgeResponse,
  LifecycleEvent
} from '../../shared/plugin/api-contract'

// Parent (host) -> child (plugin backend).
export type HostToPlugin =
  | { type: 'activate' }
  | { type: 'deactivate' }
  | { type: 'host-response'; response: BridgeResponse }
  | { type: 'ui'; message: unknown }
  | { type: 'event'; event: LifecycleEvent; payload?: unknown }

// Child (plugin backend) -> parent (host).
export type PluginToHost =
  | { type: 'ready' }
  | { type: 'activate-error'; message: string }
  | { type: 'host-request'; request: BridgeRequest }
  | { type: 'ui'; message: unknown }
