// Relay-side config for the right-sidebar plugin system (mobile path). The relay
// has no Electron userData dir, so plugin state lives under $HOME/.orca-relay —
// the same userData equivalent agent-hook-server.ts uses. Electron-free: this is
// part of the relay esbuild bundle and imports only node built-ins.

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceSnapshot } from '../shared/plugin/api-contract'

// Why: mirror the $HOME/.orca-relay convention (see agent-hook-server.ts) so all
// relay-side state lives in one predictable per-user place.
const RELAY_USERDATA_DIR_NAME = '.orca-relay'

export function relayPluginsDir(): string {
  return join(homedir(), RELAY_USERDATA_DIR_NAME, 'plugins')
}

// Per-plugin active/installed state, alongside the plugins dir.
export function relayPluginStateFilePath(): string {
  return join(homedir(), RELAY_USERDATA_DIR_NAME, 'plugins-state.json')
}

// Staging area for provisioning writes — a sibling of the plugins dir (same
// volume) so the final rename into place is atomic.
export function relayPluginStagingDir(): string {
  return join(homedir(), RELAY_USERDATA_DIR_NAME, 'plugins-staging')
}

// The built plugin-host-entry the trusted child runs. It ships alongside the
// relay bundle (build-relay emits plugin-host-entry.js next to relay.js), so the
// default resolves relative to this module's runtime directory — which, in the
// esbuild CJS relay bundle, is the relay.js output dir. The env var overrides for
// custom provisioning layouts.
export function relayPluginHostEntryPath(): string {
  const override = process.env.ORCA_RELAY_PLUGIN_HOST_ENTRY?.trim()
  return override || join(__dirname, 'plugin-host-entry.js')
}

// The relay no longer tracks a live workspace root (RelayContext.registerRoot is
// a no-op), so the only workspace:read surface returns a bounded empty snapshot.
// NEEDS-RUNTIME-VERIFY: the remote-provisioning tier replaces this with a real
// per-session snapshot once the relay tracks an active workspace again.
export function defaultRelayWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    workspaceName: '',
    currentBranch: null,
    isDirty: false,
    openFileCount: 0
  }
}
