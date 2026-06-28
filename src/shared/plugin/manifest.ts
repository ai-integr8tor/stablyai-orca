// The plugin manifest contract — the npm-package shape Orca loads. Lives in
// `src/shared/` (not the renderer or main) because every host environment that
// touches a plugin — Electron main, the preload bridge, the renderer registry,
// and the electron-free relay — validates against this one definition. Mirrors
// the single-shared-source pattern of `agent-kind.ts`.
//
// v1 is pre-stable: `hostApiVersion` is 0.x and the contract may take breaking
// changes until a real plugin exercises it (see the plan's Versioning section).

// The host API major the shipped app implements. A plugin declaring a newer
// major than this is rejected at validation time ("requires a newer Orca").
export const SUPPORTED_HOST_API_MAJOR = 0

// Closed capability union. Capabilities are declared-intent surfaced at install
// for informed consent — NOT a runtime jail (plugins run trusted with full
// Node access). Keep this list closed + `satisfies`-checked so a new capability
// is one edit, not a sweep across consent copy and the gate.
export const PLUGIN_CAPABILITIES = [
  'workspace:read',
  'commands',
  'settings',
  'process:spawn',
  'network',
  'fs'
] as const

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number]

export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === 'string' && (PLUGIN_CAPABILITIES as readonly string[]).includes(value)
}

// Object keys that would corrupt a plain-object map (prototype pollution) if a
// plugin id were used as a property key.
const DANGEROUS_PLUGIN_IDS = new Set(['__proto__', 'prototype', 'constructor'])

// A plugin id must be a single safe path segment AND a safe object key, because
// it is used both as a directory name (`join(pluginsDir, id)`) and as a map key
// (`state.plugins[id]`). Enforced at the manifest trust boundary so install,
// the manager, the store, and the settings store all receive safe ids. Plugin
// ids look like `acme.foo`. Lives in `src/shared/` so the electron-free
// validator and the main-process settings store share one definition.
export function isSafePluginId(id: string): boolean {
  if (typeof id !== 'string') {
    return false
  }
  // Must start alphanumeric, then alphanumerics / dot / dash / underscore.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    return false
  }
  // `..` is a path-traversal segment even though its characters are allowed.
  if (id.includes('..')) {
    return false
  }
  // `constructor` is alphanumeric and would pass the charset check.
  return !DANGEROUS_PLUGIN_IDS.has(id)
}

// A plugin's right-sidebar contribution. `icon` is a Lucide icon name (string)
// rather than an arbitrary image, so the activity bar stays visually
// consistent; `ui` is a single self-contained HTML file relative to the plugin
// directory (multi-file UIs are deferred — see the plan).
export type PluginSidebarContribution = {
  title: string
  icon: string
  ui: string
}

// Optional settings page the plugin presents (its own single-file webview).
export type PluginSettingsContribution = {
  ui: string
}

export type PluginContributes = {
  sidebar: PluginSidebarContribution
  settings?: PluginSettingsContribution
}

export type PluginManifest = {
  id: string
  name: string
  version: string
  // Semver of the host API the plugin targets. Pre-stable: 0.x.
  hostApiVersion: string
  // Backend entry module (Node), relative to the plugin directory.
  main: string
  contributes: PluginContributes
  capabilities: PluginCapability[]
  // Optional JSON Schema used only to validate settings writes (it does not
  // auto-generate a UI — the plugin presents its own settings page).
  settingsSchema?: Record<string, unknown>
}
