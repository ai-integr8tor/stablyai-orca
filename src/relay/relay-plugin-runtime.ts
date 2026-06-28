// Relay-side composition of the trusted plugin backend. Reuses the exact
// electron-free runtime stack the desktop main process uses (PluginManager +
// PluginRuntime + PluginHost), with relay-appropriate deps:
//   - the child forks with plain node (process.execPath is node on the relay),
//     so no ELECTRON_RUN_AS_NODE — forkEnv is omitted;
//   - host commands (open-url/clipboard) act on the device, not the relay host,
//     so invokeCommand is denied (device round-trip deferred);
//   - onUiMessage forwards the child's outbound messages to the caller, which
//     pushes them to the mobile client as plugin.uiMessage notifications.
// Electron-free: imports only node:*, the shared contract, and the (already
// electron-free) src/main/plugin runtime modules.

import { PluginManager } from '../main/plugin/plugin-manager'
import { PluginRuntime, type PluginHostFactory } from '../main/plugin/plugin-runtime'
import type { HostCommand, WorkspaceSnapshot } from '../shared/plugin/api-contract'
import {
  relayPluginHostEntryPath,
  relayPluginStateFilePath,
  relayPluginsDir
} from './relay-plugin-config'

export type RelayPluginRuntimeConfig = {
  pluginsDir?: string
  stateFilePath?: string
  entryPath?: string
  getWorkspaceSnapshot: () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>
  onUiMessage: (pluginId: string, message: unknown) => void
  // Injectable for tests so the runtime can be exercised without forking node.
  hostFactory?: PluginHostFactory
}

// Host commands run on the device (open URL / clipboard), not the relay host, so
// the relay denies them; the child surfaces the rejection to the plugin UI.
export async function denyRelayHostCommand(name: HostCommand): Promise<never> {
  throw new Error(
    `host command '${name}' requires a device round-trip; not available on the relay host`
  )
}

export function createRelayPluginRuntime(config: RelayPluginRuntimeConfig): {
  runtime: PluginRuntime
} {
  const pluginsDir = config.pluginsDir ?? relayPluginsDir()
  const manager = new PluginManager({
    pluginsDir,
    stateFilePath: config.stateFilePath ?? relayPluginStateFilePath()
  })
  const runtime = new PluginRuntime({
    manager,
    pluginsDir,
    entryPath: config.entryPath ?? relayPluginHostEntryPath(),
    // No forkEnv: the relay process is already node, so the child needs no
    // ELECTRON_RUN_AS_NODE shim (unlike the desktop main path).
    getWorkspaceSnapshot: config.getWorkspaceSnapshot,
    invokeCommand: denyRelayHostCommand,
    onUiMessage: config.onUiMessage,
    hostFactory: config.hostFactory
  })
  return { runtime }
}
