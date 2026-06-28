// Builds the capability-gated `onHostRequest` callback that PluginHost hands
// backend->host bridge requests to. This is where the shared gate, the
// WorkspaceSnapshot projection, host-command validation, and the per-plugin
// settings store come together — one place, reused by the desktop main path
// (and mirrored by the relay for mobile). Pure wiring over injected services,
// so it unit-tests with fakes + a real settings store.

import {
  gateBridgeMethod,
  projectWorkspaceSnapshot,
  validateHostCommand
} from '../../shared/plugin/capability-gate'
import type {
  BridgeErrorCode,
  BridgeRequest,
  BridgeResponse,
  HostCommand,
  WorkspaceSnapshot
} from '../../shared/plugin/api-contract'
import type { PluginCapability } from '../../shared/plugin/manifest'
import type { PluginSettingsStore } from './plugin-settings-store'

// The host-side capabilities a plugin's bridge calls resolve against. The
// workspace snapshot + command invocation are injected so the same handler
// works in Electron main and (via a parallel impl) the relay.
export type HostServices = {
  getWorkspaceSnapshot(): WorkspaceSnapshot | Promise<WorkspaceSnapshot>
  invokeCommand(name: HostCommand, params: unknown): Promise<unknown>
  settings: PluginSettingsStore
}

function ok(reqId: string, result: unknown): BridgeResponse {
  return { reqId, ok: true, result }
}

function fail(reqId: string, error: BridgeErrorCode): BridgeResponse {
  return { reqId, ok: false, error }
}

export function createHostRequestHandler(
  declaredCapabilities: readonly PluginCapability[],
  services: HostServices
): (request: BridgeRequest) => Promise<BridgeResponse> {
  return async (request) => {
    const decision = gateBridgeMethod(declaredCapabilities, request.method)
    if (!decision.granted) {
      return fail(request.reqId, decision.error)
    }
    try {
      switch (request.method) {
        case 'workspace.getSnapshot':
          return ok(request.reqId, projectWorkspaceSnapshot(await services.getWorkspaceSnapshot()))
        case 'commands.invokeHost': {
          const params = (request.params ?? {}) as { name?: unknown; params?: unknown }
          const check = validateHostCommand(params.name, params.params)
          if (!check.ok) {
            return fail(request.reqId, check.error)
          }
          return ok(
            request.reqId,
            await services.invokeCommand(params.name as HostCommand, params.params)
          )
        }
        case 'settings.get': {
          const params = (request.params ?? {}) as { key?: unknown }
          if (typeof params.key !== 'string') {
            return fail(request.reqId, 'invalid_params')
          }
          return ok(request.reqId, services.settings.get(params.key))
        }
        case 'settings.set': {
          const params = (request.params ?? {}) as { key?: unknown; value?: unknown }
          if (typeof params.key !== 'string') {
            return fail(request.reqId, 'invalid_params')
          }
          const result = services.settings.set(params.key, params.value)
          return result.ok ? ok(request.reqId, undefined) : fail(request.reqId, 'invalid_params')
        }
        default:
          return fail(request.reqId, 'unknown_method')
      }
    } catch {
      return fail(request.reqId, 'internal')
    }
  }
}
