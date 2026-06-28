// Serves a plugin's single-file UI over a registered `orca-plugin://<id>/<path>`
// scheme, scoped to the plugin's install directory. The URL parsing and the
// path-scoped resolution — the security-critical parts — are pure and unit-
// tested here; the Electron `protocol.handle` / scheme registration are thin
// wrappers marked NEEDS-RUNTIME-VERIFY (they require the running app).

import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isSafePluginId } from '../../shared/plugin/manifest'

export type AssetResolution = { ok: true; filePath: string } | { ok: false; reason: string }

// Parse `orca-plugin://<id>/<assetPath>` preserving id case (URL host-casing
// would lowercase ids, which are case-sensitive). Defaults to index.html.
export function parsePluginAssetUrl(url: string): { pluginId: string; assetPath: string } | null {
  const prefix = 'orca-plugin://'
  if (!url.startsWith(prefix)) {
    return null
  }
  const rest = url.slice(prefix.length)
  const slash = rest.indexOf('/')
  if (slash === -1) {
    return rest.length > 0 ? { pluginId: rest, assetPath: 'index.html' } : null
  }
  const pluginId = rest.slice(0, slash)
  const assetPath = rest.slice(slash + 1)
  return { pluginId, assetPath: assetPath.length > 0 ? assetPath : 'index.html' }
}

// Resolve a request to an absolute file inside `pluginsDir/<id>`, rejecting
// unsafe ids, inactive plugins, and any path that escapes the plugin directory.
export function resolvePluginAsset(
  pluginsDir: string,
  isActive: (id: string) => boolean,
  pluginId: string,
  assetPath: string
): AssetResolution {
  if (!isSafePluginId(pluginId)) {
    return { ok: false, reason: 'unsafe plugin id' }
  }
  if (!isActive(pluginId)) {
    return { ok: false, reason: 'plugin not active' }
  }
  const root = resolve(pluginsDir, pluginId)
  let decoded: string
  try {
    decoded = decodeURIComponent(assetPath)
  } catch {
    return { ok: false, reason: 'malformed asset path' }
  }
  const target = resolve(root, decoded.replace(/^[/\\]+/, ''))
  if (target !== root && !target.startsWith(root + sep)) {
    return { ok: false, reason: 'path traversal' }
  }
  return { ok: true, filePath: target }
}

// Minimal shape of the electron bits used here — avoids importing electron
// (main-only) into a module that must stay unit-testable, and keeps lint happy.
type ElectronProtocolModule = {
  protocol: {
    registerSchemesAsPrivileged(schemes: unknown): void
    handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void
  }
  net: { fetch(url: string): Promise<Response> }
}

function loadElectron(): ElectronProtocolModule {
  return require('electron') as ElectronProtocolModule
}

// NEEDS-RUNTIME-VERIFY: declare the scheme as privileged (standard + secure +
// fetch-enabled) so a tight CSP can anchor at orca-plugin://. MUST be called
// before app.whenReady() — wire into app bootstrap, not a manager constructor.
export function registerPluginScheme(): void {
  loadElectron().protocol.registerSchemesAsPrivileged([
    {
      scheme: 'orca-plugin',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false }
    }
  ])
}

// NEEDS-RUNTIME-VERIFY: register the request handler that serves resolved files.
export function registerPluginAssetProtocol(
  pluginsDir: string,
  isActive: (id: string) => boolean
): void {
  const { protocol, net } = loadElectron()
  protocol.handle('orca-plugin', (request: Request) => {
    const parsed = parsePluginAssetUrl(request.url)
    if (!parsed) {
      return new Response('bad request', { status: 400 })
    }
    const resolved = resolvePluginAsset(pluginsDir, isActive, parsed.pluginId, parsed.assetPath)
    if (!resolved.ok) {
      return new Response(resolved.reason, { status: 403 })
    }
    return net.fetch(pathToFileURL(resolved.filePath).toString())
  })
}
