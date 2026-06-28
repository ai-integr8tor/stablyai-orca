// Decides how a plugin activates: locally (in-process, the default) or on a
// remote relay (provision the files, then activate over the relay dispatcher).
// Pure + dependency-injected — the relay request fn, local activate fn, and
// bundle reader are all supplied, so this is fully unit-testable without a real
// relay or fork. The production call site that supplies a live relay request fn
// + a real remote descriptor is the NEEDS-RUNTIME-VERIFY seam (see plugin-system).

import {
  provisionToRelay,
  readPluginBundleFromDisk,
  shouldProvisionToRelay,
  type RelayRequest
} from './plugin-remote-provision'
import { isSafePluginId } from '../../shared/plugin/manifest'
import type { PluginBundle } from './plugin-bundle'
import type { ActivateResult } from './plugin-runtime'

// One canonical activation result shape, shared with PluginRuntime, so the two
// can't silently drift.
export type ActivationResult = ActivateResult

// A workspace is remote when its plugin backend must run on a relay host.
export type RemoteDescriptor = { isRemote?: boolean } | null | undefined

export type ActivationDeps = {
  pluginsDir: string
  localActivate: (pluginId: string) => Promise<ActivationResult> | ActivationResult
  relayRequest: RelayRequest
  // Injectable for tests; defaults to the real disk reader.
  readBundle?: (pluginsDir: string, pluginId: string) => PluginBundle
  // Per-relay-request deadline + the delay primitive backing it. Injected so
  // tests assert timeout behavior deterministically (a delay that resolves
  // immediately, or never) without real waiting.
  timeoutMs?: number
  delay?: (ms: number) => Promise<void>
}

// A stuck relay must not hang activation forever; 20s mirrors the relay
// protocol's idle keepalive budget without coupling to it.
const RELAY_REQUEST_TIMEOUT_MS = 20_000

// Unique marker for "the timeout won the race" — distinguishable from any relay
// payload (which is a plain object / null / undefined).
const RELAY_TIMEOUT = Symbol('relay_timeout')

function defaultDelay(ms: number): Promise<void> {
  // main-process only: unref so a losing timer never keeps the app alive.
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref()
  })
}

// A rejection from `work` propagates so the caller maps it to a typed error.
function raceWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  delay: (ms: number) => Promise<void>
): Promise<T | typeof RELAY_TIMEOUT> {
  return Promise.race([work, delay(timeoutMs).then((): typeof RELAY_TIMEOUT => RELAY_TIMEOUT)])
}

// Narrow an unknown relay activate response to a typed result without an `as`
// cast that would bypass the unknown boundary.
function readActivateResult(raw: unknown): ActivationResult {
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    return { ok: false, error: 'no_response' }
  }
  const payload = raw as { ok?: unknown; error?: unknown }
  if (typeof payload.ok !== 'boolean') {
    return { ok: false, error: 'no_response' }
  }
  if (payload.ok) {
    return { ok: true }
  }
  return { ok: false, error: typeof payload.error === 'string' ? payload.error : 'activate_failed' }
}

// Local workspaces activate in-process unchanged. Remote workspaces package the
// installed plugin, provision it to the relay, and only on provision success
// activate it there — a provision failure aborts without attempting activate.
export async function activatePluginForWorkspace(
  params: { pluginId: string; remote: RemoteDescriptor },
  deps: ActivationDeps
): Promise<ActivationResult> {
  // Reject traversal/unsafe ids before any disk read or relay call: the remote
  // path packages pluginsDir/<pluginId> into a transferable bundle, so an
  // unguarded `../…` id would harvest bytes outside the plugin dir.
  if (!isSafePluginId(params.pluginId)) {
    return { ok: false, error: 'unsafe_plugin_id' }
  }

  if (!shouldProvisionToRelay(params.remote)) {
    return deps.localActivate(params.pluginId)
  }

  const readBundle = deps.readBundle ?? readPluginBundleFromDisk
  let bundle: PluginBundle
  try {
    bundle = readBundle(deps.pluginsDir, params.pluginId)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'bundle_read_failed' }
  }

  const timeoutMs = deps.timeoutMs ?? RELAY_REQUEST_TIMEOUT_MS
  const delay = deps.delay ?? defaultDelay

  // provisionToRelay never rejects (it returns a typed failure), so we only
  // race it against the deadline.
  const provisioned = await raceWithTimeout(
    provisionToRelay(deps.relayRequest, bundle),
    timeoutMs,
    delay
  )
  if (provisioned === RELAY_TIMEOUT) {
    return { ok: false, error: 'provision_timeout' }
  }
  if (!provisioned.ok) {
    return { ok: false, error: provisioned.error ?? 'provision_failed' }
  }

  let activateResult: ActivationResult
  try {
    const raw = await raceWithTimeout(
      deps.relayRequest('plugin.activate', { pluginId: params.pluginId }),
      timeoutMs,
      delay
    )
    activateResult =
      raw === RELAY_TIMEOUT ? { ok: false, error: 'activate_timeout' } : readActivateResult(raw)
  } catch (error) {
    activateResult = {
      ok: false,
      error: error instanceof Error ? error.message : 'activate_failed'
    }
  }
  if (activateResult.ok) {
    return { ok: true }
  }

  // Activate failed after a committed provision — the relay may hold a
  // forked-but-unacknowledged backend. Best-effort, deadline-bounded deactivate
  // to reclaim it; swallowed (and timed) so it never masks or outlasts the
  // original activate failure.
  await raceWithTimeout(
    deps.relayRequest('plugin.deactivate', { pluginId: params.pluginId }),
    timeoutMs,
    delay
  ).catch(() => {})
  return activateResult
}
