import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError, type RuntimeClient, type RuntimeRpcSuccess } from '../runtime-client'
import type {
  AgentHookInstallStatus,
  RemoteAgentHookInstallReport
} from '../../shared/agent-hook-types'
import { getDefaultPersistedState } from '../../shared/constants'
import type { PersistedState } from '../../shared/types'
import {
  applyAgentStatusHooksEnabled,
  getManagedAgentHookStatuses
} from '../../main/agent-hooks/managed-agent-hook-controls'
import { getDefaultUserDataPath } from '../runtime-client'

type AgentHookCommandResult = {
  enabled: boolean
  settingsPath: string
  appliedBy: 'runtime' | 'offline'
  statuses: AgentHookInstallStatus[]
  /** Per-SSH-host install outcomes; null when the runtime is unreachable and
   *  remote hosts therefore cannot be inspected (#8711). */
  remotes?: RemoteAgentHookInstallReport[] | null
}

function getDataPath(): string {
  return join(getDefaultUserDataPath(), 'orca-data.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPersistedState(dataPath: string): PersistedState {
  if (!existsSync(dataPath)) {
    return getDefaultPersistedState(homedir())
  }
  try {
    const parsed = JSON.parse(readFileSync(dataPath, 'utf-8'))
    if (!isRecord(parsed)) {
      throw new Error('file does not contain a JSON object')
    }
    return parsed as PersistedState
  } catch (error) {
    throw new RuntimeClientError(
      'runtime_error',
      `Could not read ${dataPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function writePersistedState(dataPath: string, state: PersistedState): void {
  mkdirSync(dirname(dataPath), { recursive: true })
  const tmpPath = join(dirname(dataPath), `.${Date.now()}-${randomUUID()}.tmp`)
  let renamed = false
  try {
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
    renameSync(tmpPath, dataPath)
    renamed = true
  } finally {
    if (!renamed && existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath)
      } catch {
        // best effort
      }
    }
  }
}

function readEnabledFromDisk(): boolean {
  const state = readPersistedState(getDataPath())
  return state.settings?.agentStatusHooksEnabled !== false
}

function updateEnabledOnDisk(enabled: boolean): string {
  const dataPath = getDataPath()
  const state = readPersistedState(dataPath)
  state.settings = {
    ...getDefaultPersistedState(homedir()).settings,
    ...state.settings,
    agentStatusHooksEnabled: enabled
  }
  writePersistedState(dataPath, state)
  return dataPath
}

async function updateRunningRuntime(client: RuntimeClient, enabled: boolean): Promise<boolean> {
  try {
    const status = await client.getCliStatus()
    if (!status.result.runtime.reachable) {
      return false
    }
    await client.call(
      'settings.update',
      { agentStatusHooksEnabled: enabled },
      { timeoutMs: 10_000 }
    )
    return true
  } catch {
    return false
  }
}

function localSuccess<TResult>(result: TResult): RuntimeRpcSuccess<TResult> {
  return {
    id: 'local',
    ok: true,
    result,
    _meta: {
      runtimeId: 'local'
    }
  }
}

function formatAgentHookCommandResult(result: AgentHookCommandResult): string {
  const statusSummary = result.statuses
    .map((status) => `${status.agent}: ${status.state}`)
    .join('\n')
  const lines = [
    `agentStatusHooksEnabled: ${result.enabled}`,
    `appliedBy: ${result.appliedBy}`,
    `settingsPath: ${result.settingsPath}`,
    statusSummary
  ].filter(Boolean)
  for (const remote of result.remotes ?? []) {
    lines.push(formatRemoteReport(remote))
  }
  return lines.join('\n')
}

function formatRemoteReport(remote: RemoteAgentHookInstallReport): string {
  const header = `ssh:${remote.targetId}: ${remote.state}${remote.detail ? ` — ${remote.detail}` : ''}`
  const agentLines = remote.statuses.map((status) => {
    const detail = status.state === 'error' && status.detail ? ` — ${status.detail}` : ''
    return `  ${status.agent}: ${status.state}${detail}`
  })
  return [header, ...agentLines].join('\n')
}

async function setAgentHooksEnabled(
  client: RuntimeClient,
  enabled: boolean
): Promise<AgentHookCommandResult> {
  const updatedRuntime = await updateRunningRuntime(client, enabled)
  const settingsPath = updatedRuntime ? getDataPath() : updateEnabledOnDisk(enabled)
  const statuses = updatedRuntime
    ? getManagedAgentHookStatuses()
    : applyAgentStatusHooksEnabled(enabled)
  return {
    enabled,
    settingsPath,
    appliedBy: updatedRuntime ? 'runtime' : 'offline',
    statuses
  }
}

// Why: an SSH agent reads hooks on its remote host, so a purely local file
// check reports `installed` for a host it never looked at (#8711). Only the
// running runtime knows each relay session's actual install outcome; when it
// is unreachable no SSH agents are running either, so local-only is truthful.
// A reachable runtime whose RPC fails is different: swallowing that error
// would print a local-only report that can say `installed` while active SSH
// state is unknown — the exact green-but-wrong output this command fixes —
// so the RPC failure surfaces to the caller instead.
async function fetchRuntimeHookStatuses(client: RuntimeClient): Promise<{
  local: AgentHookInstallStatus[]
  remotes: RemoteAgentHookInstallReport[]
} | null> {
  let reachable = false
  try {
    const status = await client.getCliStatus()
    reachable = status.result.runtime.reachable
  } catch {
    return null
  }
  if (!reachable) {
    return null
  }
  const response = await client.call<{
    local: AgentHookInstallStatus[]
    remotes: RemoteAgentHookInstallReport[]
  }>('agentHooks.status', undefined, { timeoutMs: 10_000 })
  return response.result
}

export const AGENT_HOOK_HANDLERS: Record<string, CommandHandler> = {
  'agent hooks status': async ({ client, json }) => {
    const runtimeStatuses = await fetchRuntimeHookStatuses(client)
    const result: AgentHookCommandResult = {
      enabled: readEnabledFromDisk(),
      settingsPath: getDataPath(),
      appliedBy: runtimeStatuses ? 'runtime' : 'offline',
      statuses: runtimeStatuses?.local ?? getManagedAgentHookStatuses(),
      remotes: runtimeStatuses ? runtimeStatuses.remotes : null
    }
    printResult(localSuccess(result), json, formatAgentHookCommandResult)
  },
  'agent hooks off': async ({ client, json }) => {
    const result = await setAgentHooksEnabled(client, false)
    printResult(localSuccess(result), json, formatAgentHookCommandResult)
  },
  'agent hooks on': async ({ client, json }) => {
    const result = await setAgentHooksEnabled(client, true)
    printResult(localSuccess(result), json, formatAgentHookCommandResult)
  }
}
