// Desktop side of plugin provisioning: read an installed plugin directory off
// disk into a transferable bundle (U1 codec) and send it to the relay's
// plugin.provision before activating, when the workspace runs on a remote relay.
// The disk read + predicate are pure/testable; the live dispatcher wiring is the
// NEEDS-RUNTIME-VERIFY seam (no remote relay in this environment).

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { isSafeBundlePath, serializePluginBundle, type PluginBundle } from './plugin-bundle'

// Recursively read pluginsDir/<pluginId> into a bundle. Symlinks are skipped
// entirely (never followed, never packaged) so a link can't smuggle bytes from
// outside the plugin dir; any path that isn't bundle-safe is also dropped.
// Throws on filesystem errors (missing/unreadable plugin dir) — it reads a
// known-installed plugin, so the caller treats a throw as "can't provision".
export function readPluginBundleFromDisk(pluginsDir: string, pluginId: string): PluginBundle {
  const root = join(pluginsDir, pluginId)
  const files: { path: string; dataBase64: string }[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const stat = lstatSync(abs)
      if (stat.isSymbolicLink()) {
        continue
      }
      if (stat.isDirectory()) {
        walk(abs)
        continue
      }
      if (!stat.isFile()) {
        continue
      }
      const rel = relative(root, abs).split(sep).join('/')
      if (!isSafeBundlePath(rel)) {
        continue
      }
      files.push({ path: rel, dataBase64: readFileSync(abs).toString('base64') })
    }
  }
  walk(root)
  return serializePluginBundle(pluginId, files)
}

export type RelayRequest = (method: string, params?: Record<string, unknown>) => Promise<unknown>

// Send a packaged bundle to the relay. Returns the handler's result (or a
// synthetic failure if the relay returned nothing).
export async function provisionToRelay(
  request: RelayRequest,
  bundle: PluginBundle
): Promise<{ ok: boolean; error?: string }> {
  let result: { ok?: boolean; error?: string } | null | undefined
  try {
    result = (await request('plugin.provision', { bundle })) as
      | { ok?: boolean; error?: string }
      | null
      | undefined
  } catch (error) {
    // A dropped/absent relay connection rejects the request; surface it as a
    // typed failure so callers handle it like any other provision error.
    return { ok: false, error: error instanceof Error ? error.message : 'request_failed' }
  }
  if (!result || typeof result.ok !== 'boolean') {
    return { ok: false, error: 'no_response' }
  }
  return { ok: result.ok, error: result.error }
}

// A plugin only needs provisioning when its backend will run on a remote relay;
// a local (in-process) plugin already has its files in the desktop userData.
export function shouldProvisionToRelay(
  workspace: { isRemote?: boolean } | null | undefined
): boolean {
  return Boolean(workspace?.isRemote)
}
