// NEEDS-RUNTIME-VERIFY: relay-side plugin host (mobile path). Registers plugin.*
// JSON-RPC methods so the mobile app can list plugins, fetch a plugin's single
// UI HTML, run the trusted backend child on the relay host, and round-trip
// UI<->backend messages — all where the workspace lives (the relay host,
// possibly remote over SSH).
//
// The backend bridge is asynchronous message-passing (mirroring the desktop):
// inbound webview messages are posted into the child via plugin.postUi; the
// child answers with its own capability-gated handler and posts responses back,
// which we push to the mobile client as plugin.uiMessage notifications. The
// in-webview ui-bridge-client correlates reqIds, so settings/workspace round
// trips work without the relay parsing the payload. Host commands
// (open-url/clipboard) act on the device and are denied by the runtime (device
// round-trip deferred).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discoverPlugins, type DiscoveryResult } from '../main/plugin/plugin-discovery'
import { isSafePluginId } from '../shared/plugin/manifest'
import type { WorkspaceSnapshot } from '../shared/plugin/api-contract'
import type { PluginHostFactory } from '../main/plugin/plugin-runtime'
import { createRelayPluginRuntime } from './relay-plugin-runtime'
import { provisionPlugin } from './plugin-provision'

export type RelayRequestContext = { clientId?: number }

export type RelayDispatcherLike = {
  onRequest(
    method: string,
    handler: (params: Record<string, unknown>, context: RelayRequestContext) => Promise<unknown>
  ): void
  // Send a notification to a single client (by id). Used so a plugin's backend
  // responses reach only the client that opened it, never every attached client.
  notifyClient(clientId: number, method: string, params?: Record<string, unknown>): void
  onClientDetached(listener: (clientId: number) => void): () => void
}

export type RelayPluginConfig = {
  pluginsDir: string
  getWorkspaceSnapshot: () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>
  // Optional overrides (tests / provisioning): the built host-entry path, the
  // state + staging dirs, and an injectable host factory to avoid forking real
  // processes.
  entryPath?: string
  stateFilePath?: string
  stagingDir?: string
  hostFactory?: PluginHostFactory
  // Injectable for tests so a counting fake makes the discovery-cache scan count
  // observable; defaults to the real disk scanner.
  discover?: (pluginsDir: string) => DiscoveryResult
}

type PluginMeta = { id: string; title: string; icon: string; version: string; ui: string }

export function registerRelayPluginHandlers(
  dispatcher: RelayDispatcherLike,
  config: RelayPluginConfig
): { stopAll: () => Promise<void>; stopAllSync: () => void } {
  // Discovery is a full plugins-dir scan + per-manifest validate; memoize it so
  // back-to-back requests don't re-scan. The installed set only changes via
  // plugin.provision, which invalidates the cache on success (see below).
  const discover = config.discover ?? discoverPlugins
  let cachedDiscovery: DiscoveryResult | null = null
  const getDiscovered = (): DiscoveryResult => (cachedDiscovery ??= discover(config.pluginsDir))
  const invalidateDiscovery = (): void => {
    cachedDiscovery = null
  }

  // Boundary validation: the id must be structurally safe AND match an installed,
  // validated manifest. The isSafePluginId gate runs first so a client can't name
  // an arbitrary id (confused-deputy) and traversal-shaped ids never reach the
  // runtime or the cache lookup.
  const isInstalledPlugin = (pluginId: string): boolean => {
    if (!isSafePluginId(pluginId)) {
      return false
    }
    return getDiscovered().valid.some((p) => p.manifest.id === pluginId)
  }
  // Which clients have opened each plugin. A backend response carries one
  // client's data (settings, workspace snapshot), so it must be routed only to
  // the clients that opened that plugin — never broadcast to every client.
  const subscribers = new Map<string, Set<number>>()
  const subscribe = (pluginId: string, clientId: number | undefined): void => {
    if (clientId === undefined) {
      return
    }
    let set = subscribers.get(pluginId)
    if (!set) {
      set = new Set()
      subscribers.set(pluginId, set)
    }
    set.add(clientId)
  }

  const { runtime } = createRelayPluginRuntime({
    pluginsDir: config.pluginsDir,
    entryPath: config.entryPath,
    stateFilePath: config.stateFilePath,
    getWorkspaceSnapshot: config.getWorkspaceSnapshot,
    // Child outbound messages (bridge responses + lifecycle events) go only to
    // the clients that opened this plugin; the webview's ui-bridge-client then
    // matches reqIds. Broadcasting would leak one client's data to others.
    onUiMessage: (pluginId, message) => {
      for (const clientId of subscribers.get(pluginId) ?? []) {
        dispatcher.notifyClient(clientId, 'plugin.uiMessage', { pluginId, message })
      }
    },
    hostFactory: config.hostFactory
  })

  // Drop one client's subscription; stop the shared backend child only when the
  // last subscriber for that plugin leaves (refcount). A missing clientId means
  // a full stop (clears the set and deactivates regardless).
  // Note: a crash-restart that fires between the last subscriber dropping and the
  // deactivate is a narrow message-loss window, not an orphan (bounded restarts).
  const releasePlugin = async (pluginId: string, clientId: number | undefined): Promise<void> => {
    const set = subscribers.get(pluginId)
    if (clientId !== undefined && set) {
      set.delete(clientId)
      if (set.size > 0) {
        return
      }
    }
    subscribers.delete(pluginId)
    await runtime.deactivate(pluginId)
  }

  // A dropped client releases every plugin it had open. releasePlugin only ever
  // deletes the current pluginId key, which Map for-of tolerates.
  dispatcher.onClientDetached((clientId) => {
    for (const [pluginId, set] of subscribers) {
      if (set.has(clientId)) {
        // Fire-and-forget: surface a failed deactivate rather than dropping it
        // as an unhandled rejection (the relay only logs those).
        releasePlugin(pluginId, clientId).catch((error: unknown) => {
          process.stderr.write(`[relay] plugin '${pluginId}' release failed: ${String(error)}\n`)
        })
      }
    }
  })

  dispatcher.onRequest('plugin.list', async () => {
    const result = getDiscovered()
    const plugins: PluginMeta[] = result.valid.map((p) => ({
      id: p.manifest.id,
      title: p.manifest.contributes.sidebar.title,
      icon: p.manifest.contributes.sidebar.icon,
      version: p.manifest.version,
      ui: p.manifest.contributes.sidebar.ui
    }))
    return { plugins }
  })

  // Serve a plugin's single UI HTML inline (mobile feeds it to react-native-
  // webview as { html } — no on-device server, which is why v1 mandates a
  // single self-contained file).
  dispatcher.onRequest('plugin.getEntry', async (params) => {
    const pluginId = String(params.pluginId ?? '')
    // Same id-safety gate as activate/postUi, first: short-circuits unsafe ids
    // before the cache lookup and keeps one boundary-contract shape everywhere.
    if (!isSafePluginId(pluginId)) {
      return { ok: false, error: 'unknown_plugin' }
    }
    const found = getDiscovered().valid.find((p) => p.manifest.id === pluginId)
    if (!found) {
      return { ok: false, error: 'unknown_plugin' }
    }
    // Use the discovered dir, not a re-join of the client-supplied pluginId, so
    // the served path is anchored to a validated manifest's own directory.
    const htmlPath = join(found.dir, found.manifest.contributes.sidebar.ui)
    if (!existsSync(htmlPath)) {
      return { ok: false, error: 'entry_missing' }
    }
    // Return the structured contract on an I/O race (file removed after the
    // existsSync check) rather than leaking a raw fs error to the client.
    try {
      return { ok: true, html: readFileSync(htmlPath, 'utf8') }
    } catch {
      return { ok: false, error: 'entry_read_failed' }
    }
  })

  // Receive a plugin bundle from the desktop and write it under the relay
  // plugins dir (verified + atomic). Must precede plugin.activate for a plugin
  // whose files aren't already on the relay host.
  dispatcher.onRequest('plugin.provision', async (params) => {
    // provisionPlugin is fully synchronous, so concurrent provisions can't
    // interleave (the event loop is blocked through each call) — no per-id lock
    // needed. Staging defaults to a same-volume sibling of the plugins dir so the
    // final rename is atomic.
    const result = provisionPlugin(params.bundle, {
      pluginsDir: config.pluginsDir,
      stagingDir: config.stagingDir ?? `${config.pluginsDir}-staging`
    })
    // A successful provision changed the installed set on disk — drop the cache
    // so a following plugin.activate discovers the new plugin (not stale
    // unknown_plugin). A failed provision left the dir untouched: keep the cache.
    if (result.ok) {
      invalidateDiscovery()
    }
    return result
  })

  // Start the trusted backend child on the relay host.
  dispatcher.onRequest('plugin.activate', async (params, context) => {
    const pluginId = String(params.pluginId ?? '')
    if (!isInstalledPlugin(pluginId)) {
      return { ok: false, error: 'unknown_plugin' }
    }
    subscribe(pluginId, context.clientId)
    return runtime.activate(pluginId)
  })

  // Stop the backend child.
  dispatcher.onRequest('plugin.deactivate', async (params, context) => {
    const pluginId = String(params.pluginId ?? '')
    if (!isSafePluginId(pluginId)) {
      return { ok: false, error: 'invalid_params' }
    }
    // Refcounted: stops the child only when this was the last subscriber.
    await releasePlugin(pluginId, context.clientId)
    return { ok: true }
  })

  // Inbound webview -> backend message. Lazily activates so a message that races
  // ahead of an explicit activate still reaches a running child.
  dispatcher.onRequest('plugin.postUi', async (params, context) => {
    const pluginId = String(params.pluginId ?? '')
    if (!isInstalledPlugin(pluginId)) {
      return { ok: false, error: 'unknown_plugin' }
    }
    subscribe(pluginId, context.clientId)
    if (!runtime.isRunning(pluginId)) {
      const activated = await runtime.activate(pluginId)
      if (!activated.ok) {
        return { ok: false, error: 'activation_failed' }
      }
    }
    runtime.postUi(pluginId, params.message)
    return { ok: true }
  })

  return { stopAll: () => runtime.stopAll(), stopAllSync: () => runtime.stopAllSync() }
}
